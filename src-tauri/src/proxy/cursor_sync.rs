use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

const CURSOR_CONFIG_FILE: &str = "settings.json";
const BACKUP_SUFFIX: &str = ".antigravity.bak";

// JSON fields to sync in Cursor settings.json
const CURSOR_API_KEY_FIELD: &str = "openai.apiKey";
const CURSOR_BASE_URL_FIELD: &str = "openai.baseUrl";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CursorSyncStatus {
    pub installed: bool,
    pub config_path: Option<String>,
    pub is_synced: bool,
    pub has_backup: bool,
    pub current_base_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CursorModelPreset {
    /// 预设名称
    pub name: String,
    /// 模型映射表 (Cursor 模型 ID → Antigravity 上游模型 ID)
    pub mappings: HashMap<String, String>,
}

/// Get the Cursor config directory based on the current platform.
/// - macOS: ~/Library/Application Support/Cursor/User/
/// - Windows: %APPDATA%/Cursor/User/
/// - Linux: ~/.config/Cursor/User/
pub fn get_cursor_config_dir() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        dirs::home_dir().map(|h| h.join("Library/Application Support/Cursor/User"))
    }

    #[cfg(target_os = "windows")]
    {
        dirs::config_dir().map(|c| c.join("Cursor").join("User"))
    }

    #[cfg(target_os = "linux")]
    {
        dirs::home_dir().map(|h| h.join(".config/Cursor/User"))
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        None
    }
}

fn get_config_path() -> Option<PathBuf> {
    get_cursor_config_dir().map(|dir| dir.join(CURSOR_CONFIG_FILE))
}

fn get_backup_path(config_path: &PathBuf) -> PathBuf {
    config_path.with_file_name(format!("{}{}", CURSOR_CONFIG_FILE, BACKUP_SUFFIX))
}

/// Check if Cursor is installed by verifying the config directory exists.
/// Returns (installed, config_path_string).
pub fn check_cursor_installed() -> (bool, Option<String>) {
    let config_path = match get_config_path() {
        Some(p) => p,
        None => return (false, None),
    };

    // Check if the Cursor User directory exists (indicates Cursor has been run at least once)
    let config_dir = match config_path.parent() {
        Some(dir) => dir,
        None => return (false, None),
    };

    if config_dir.exists() {
        let path_str = config_path.to_string_lossy().to_string();
        tracing::debug!("Cursor config path detected: {}", path_str);
        (true, Some(path_str))
    } else {
        tracing::debug!(
            "Cursor config directory not found: {:?}",
            config_dir
        );
        (false, None)
    }
}

/// Check the current sync status of Cursor configuration.
pub fn get_sync_status(proxy_url: &str, api_key: &str) -> CursorSyncStatus {
    let config_path = match get_config_path() {
        Some(p) => p,
        None => {
            return CursorSyncStatus {
                installed: false,
                config_path: None,
                is_synced: false,
                has_backup: false,
                current_base_url: None,
            };
        }
    };

    let (installed, config_path_str) = check_cursor_installed();
    let backup_path = get_backup_path(&config_path);
    let has_backup = backup_path.exists();

    if !installed || !config_path.exists() {
        return CursorSyncStatus {
            installed,
            config_path: config_path_str,
            is_synced: false,
            has_backup,
            current_base_url: None,
        };
    }

    let content = match fs::read_to_string(&config_path) {
        Ok(c) => c,
        Err(_) => {
            return CursorSyncStatus {
                installed,
                config_path: config_path_str,
                is_synced: false,
                has_backup,
                current_base_url: None,
            };
        }
    };

    let json: Value = serde_json::from_str(&content).unwrap_or_default();

    let current_base_url = json
        .get(CURSOR_BASE_URL_FIELD)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let current_api_key = json
        .get(CURSOR_API_KEY_FIELD)
        .and_then(|v| v.as_str());

    // Check if both fields match the expected values
    let is_synced = match (&current_base_url, current_api_key) {
        (Some(url), Some(key)) => {
            url.trim_end_matches('/') == proxy_url.trim_end_matches('/') && key == api_key
        }
        _ => false,
    };

    CursorSyncStatus {
        installed,
        config_path: config_path_str,
        is_synced,
        has_backup,
        current_base_url,
    }
}

/// Create a backup of the config file if one doesn't already exist.
fn create_backup(path: &PathBuf) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }

    let backup_path = get_backup_path(path);

    // Don't overwrite existing backup — preserve the original state
    if backup_path.exists() {
        return Ok(());
    }

    fs::copy(path, &backup_path)
        .map_err(|e| format!("Failed to create backup: {}", e))?;

    tracing::info!("Created Cursor config backup: {:?}", backup_path);
    Ok(())
}

/// Sync Antigravity proxy configuration into Cursor's settings.json.
/// Only modifies the AI proxy fields (openai.apiKey, openai.baseUrl),
/// preserving all other user settings.
pub fn sync_config(proxy_url: &str, api_key: &str) -> Result<(), String> {
    let config_path = get_config_path()
        .ok_or_else(|| "Failed to determine Cursor config directory".to_string())?;

    let config_dir = config_path
        .parent()
        .ok_or_else(|| "Invalid Cursor config path".to_string())?;

    if !config_dir.exists() {
        return Err(format!(
            "Cursor is not installed. Expected config directory: {:?}",
            config_dir
        ));
    }

    // Create backup before modifying
    create_backup(&config_path)?;

    // Read existing config or start with empty object
    let mut json: Value = if config_path.exists() {
        let content = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read Cursor config: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse Cursor config JSON: {}", e))?
    } else {
        serde_json::json!({})
    };

    // Ensure root is an object
    if !json.is_object() {
        json = serde_json::json!({});
    }

    // Only modify the AI proxy fields, preserve everything else
    json[CURSOR_BASE_URL_FIELD] = Value::String(proxy_url.to_string());
    json[CURSOR_API_KEY_FIELD] = Value::String(api_key.to_string());

    // Atomic write via temp file
    let tmp_path = config_path.with_extension("tmp");
    fs::write(
        &tmp_path,
        serde_json::to_string_pretty(&json)
            .map_err(|e| format!("Failed to serialize config: {}", e))?,
    )
    .map_err(|e| format!("Failed to write temp file: {}", e))?;

    fs::rename(&tmp_path, &config_path)
        .map_err(|e| format!("Failed to rename config file: {}", e))?;

    tracing::info!("Cursor config synced successfully");
    Ok(())
}

/// Restore Cursor configuration from the .antigravity.bak backup.
pub fn restore_config() -> Result<(), String> {
    let config_path = get_config_path()
        .ok_or_else(|| "Failed to determine Cursor config directory".to_string())?;

    let backup_path = get_backup_path(&config_path);

    if !backup_path.exists() {
        return Err("No backup file found. Cannot restore Cursor configuration.".to_string());
    }

    // Remove current config if it exists
    if config_path.exists() {
        fs::remove_file(&config_path)
            .map_err(|e| format!("Failed to remove existing config: {}", e))?;
    }

    // Restore from backup (move, not copy — consumes the backup)
    fs::rename(&backup_path, &config_path)
        .map_err(|e| format!("Failed to restore config from backup: {}", e))?;

    tracing::info!("Cursor config restored from backup");
    Ok(())
}

/// Read the current Cursor configuration file content.
pub fn get_config_content() -> Result<String, String> {
    let config_path = get_config_path()
        .ok_or_else(|| "Failed to determine Cursor config directory".to_string())?;

    if !config_path.exists() {
        return Err(format!(
            "Cursor config file does not exist: {:?}",
            config_path
        ));
    }

    fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read Cursor config: {}", e))
}

// --- Tauri Commands ---

#[tauri::command]
pub async fn get_cursor_sync_status(
    proxy_url: String,
    api_key: String,
) -> Result<CursorSyncStatus, String> {
    Ok(get_sync_status(&proxy_url, &api_key))
}

#[tauri::command]
pub async fn execute_cursor_sync(
    proxy_url: String,
    api_key: String,
) -> Result<(), String> {
    sync_config(&proxy_url, &api_key)
}

#[tauri::command]
pub async fn execute_cursor_restore() -> Result<(), String> {
    restore_config()
}

#[tauri::command]
pub async fn get_cursor_config_content() -> Result<String, String> {
    get_config_content()
}

// --- Cursor Model Mapping ---

/// Get the default Cursor model mapping preset.
/// Maps Cursor model IDs to Antigravity upstream model IDs.
pub fn get_cursor_default_mapping() -> HashMap<String, String> {
    let mut map = HashMap::new();
    // GPT 系列 → Gemini
    map.insert("gpt-4".into(), "gemini-3-pro-high".into());
    map.insert("gpt-4o".into(), "gemini-3-pro-high".into());
    map.insert("gpt-4o-mini".into(), "gemini-3-flash".into());
    map.insert("gpt-3.5-turbo".into(), "gemini-3-flash".into());
    map.insert("gpt-4-turbo".into(), "gemini-3-pro-high".into());
    // Claude 系列 → Claude (直通)
    map.insert("claude-3.5-sonnet".into(), "claude-sonnet-4-5".into());
    map.insert("claude-3-opus".into(), "claude-opus-4-6-thinking".into());
    map.insert("claude-3-sonnet".into(), "claude-sonnet-4-5".into());
    map.insert("claude-3-haiku".into(), "gemini-3-flash".into());
    // Cursor 特有模型名
    map.insert("cursor-small".into(), "gemini-3-flash".into());
    map.insert("cursor-large".into(), "gemini-3-pro-high".into());
    map
}

#[tauri::command]
pub async fn get_cursor_model_preset() -> Result<CursorModelPreset, String> {
    Ok(CursorModelPreset {
        name: "Cursor Default".to_string(),
        mappings: get_cursor_default_mapping(),
    })
}
