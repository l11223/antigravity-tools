import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
    CheckCircle2,
    AlertCircle,
    RefreshCw,
    Loader2,
    Eye,
    RotateCcw,
    Copy,
    X,
    MousePointerClick,
    Shield,
    Zap,
    FolderOpen,
} from 'lucide-react';
import { copyToClipboard } from '../../utils/clipboard';
import { request as invoke } from '../../utils/request';
import { showToast } from '../common/ToastContainer';
import ModalDialog from '../common/ModalDialog';
import { cn } from '../../utils/cn';

interface CursorSyncCardProps {
    proxyUrl: string;
    apiKey: string;
    className?: string;
}

interface CursorSyncStatus {
    installed: boolean;
    config_path: string | null;
    is_synced: boolean;
    has_backup: boolean;
    current_base_url: string | null;
}

/** Ensure proxy URL ends with /v1 for OpenAI-compatible clients like Cursor */
function formatProxyUrl(url: string): string {
    const base = url.trimEnd().replace(/\/+$/, '');
    return base.endsWith('/v1') ? base : `${base}/v1`;
}

export const CursorSyncCard = ({ proxyUrl, apiKey, className }: CursorSyncCardProps) => {
    const { t } = useTranslation();
    const [status, setStatus] = useState<CursorSyncStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [viewingConfig, setViewingConfig] = useState<string | null>(null);
    const [restoreConfirm, setRestoreConfirm] = useState(false);
    const [syncConfirm, setSyncConfirm] = useState(false);

    const formattedUrl = formatProxyUrl(proxyUrl);

    const checkStatus = useCallback(async () => {
        setLoading(true);
        try {
            const result = await invoke<CursorSyncStatus>('get_cursor_sync_status', {
                proxyUrl: formattedUrl,
                apiKey: apiKey,
            });
            setStatus(result);
        } catch (error) {
            console.error('Failed to check Cursor status:', error);
        } finally {
            setLoading(false);
        }
    }, [formattedUrl, apiKey]);

    const handleSync = () => setSyncConfirm(true);

    const executeSync = async () => {
        setSyncConfirm(false);
        if (!proxyUrl || !apiKey) {
            showToast(t('proxy.cursor_sync.toast.config_missing', { defaultValue: '请先生成 API Key 并启动服务' }), 'error');
            return;
        }
        setSyncing(true);
        try {
            await invoke('execute_cursor_sync', {
                proxyUrl: formattedUrl,
                apiKey: apiKey,
            });
            showToast(t('proxy.cursor_sync.toast.sync_success', { defaultValue: 'Cursor 配置同步成功' }), 'success');
            await checkStatus();
        } catch (error: any) {
            showToast(t('proxy.cursor_sync.toast.sync_error', { error: error.toString(), defaultValue: `同步失败: ${error.toString()}` }), 'error');
        } finally {
            setSyncing(false);
        }
    };

    const handleRestore = () => setRestoreConfirm(true);

    const executeRestore = async () => {
        setRestoreConfirm(false);
        setSyncing(true);
        try {
            await invoke('execute_cursor_restore', {});
            showToast(t('proxy.cursor_sync.toast.restore_success', { defaultValue: 'Cursor 配置已恢复' }), 'success');
            await checkStatus();
        } catch (error: any) {
            showToast(t('proxy.cursor_sync.toast.restore_error', { error: error.toString(), defaultValue: `恢复失败: ${error.toString()}` }), 'error');
        } finally {
            setSyncing(false);
        }
    };

    const handleViewConfig = async () => {
        try {
            const content = await invoke<string>('get_cursor_config_content', {});
            setViewingConfig(content);
        } catch (error: any) {
            showToast(error.toString(), 'error');
        }
    };

    useEffect(() => {
        checkStatus();
    }, [checkStatus]);

    // Derive connection state
    const isConnected = status?.installed && status?.is_synced;
    const isInstalled = status?.installed;

    return (
        <div className={cn("space-y-4", className)}>
            {/* Main Status Card */}
            <div className={cn(
                "relative overflow-hidden rounded-xl border transition-all duration-300",
                isConnected
                    ? "bg-gradient-to-br from-cyan-50/80 via-white to-emerald-50/50 dark:from-cyan-950/30 dark:via-base-100 dark:to-emerald-950/20 border-cyan-200/60 dark:border-cyan-800/40 shadow-sm shadow-cyan-100/50 dark:shadow-cyan-900/20"
                    : "bg-white/50 dark:bg-gray-800/40 border-gray-100 dark:border-white/5 shadow-sm"
            )}>
                {/* Subtle glow effect when connected */}
                {isConnected && (
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-cyan-400/10 to-transparent rounded-bl-full pointer-events-none" />
                )}

                <div className="relative p-5">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-4 mb-5">
                        <div className="flex items-center gap-3.5">
                            <div className={cn(
                                "relative p-3 rounded-xl transition-all duration-300",
                                isConnected
                                    ? "bg-gradient-to-br from-cyan-500 to-teal-600 shadow-lg shadow-cyan-500/25"
                                    : "bg-gray-100 dark:bg-base-300"
                            )}>
                                <MousePointerClick size={22} className={isConnected ? "text-white" : "text-cyan-500"} />
                                {isConnected && (
                                    <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-white dark:border-base-100 shadow-sm">
                                        <div className="absolute inset-0 bg-emerald-400 rounded-full animate-ping opacity-40" />
                                    </div>
                                )}
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight">
                                    {t('proxy.cursor_sync.card_title', { defaultValue: 'Cursor Editor' })}
                                </h4>
                                <div className="mt-1.5 flex items-center gap-2">
                                    {loading ? (
                                        <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                                            <Loader2 size={10} className="animate-spin" />
                                            {t('proxy.cursor_sync.status.detecting', { defaultValue: '检测中...' })}
                                        </div>
                                    ) : isInstalled ? (
                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-100/80 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 font-bold tracking-wide">
                                            {t('proxy.cursor_sync.status.installed', { defaultValue: '已安装' })}
                                        </span>
                                    ) : (
                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 font-medium">
                                            {t('proxy.cursor_sync.status.not_installed', { defaultValue: '未检测到' })}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Sync Status Badge */}
                        {!loading && isInstalled && (
                            <div className={cn(
                                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wide transition-all shrink-0 whitespace-nowrap",
                                status.is_synced
                                    ? "bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-md shadow-emerald-500/20"
                                    : "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40"
                            )}>
                                {status.is_synced ? (
                                    <><CheckCircle2 size={12} className="shrink-0" /> {t('proxy.cursor_sync.status.synced', { defaultValue: '已连接' })}</>
                                ) : (
                                    <><AlertCircle size={12} className="shrink-0" /> {t('proxy.cursor_sync.status.not_synced', { defaultValue: '未同步' })}</>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Info Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                        {/* Base URL */}
                        <div className="sm:col-span-2 p-3 bg-gray-50/80 dark:bg-gray-900/40 rounded-lg border border-dashed border-gray-200 dark:border-white/10">
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <Zap size={10} className="text-cyan-500" />
                                <span className="text-[9px] text-gray-400 dark:text-gray-500 uppercase font-bold tracking-wider">
                                    {t('proxy.cursor_sync.status.current_base_url', { defaultValue: 'Base URL' })}
                                </span>
                            </div>
                            <div className="text-[11px] font-mono truncate text-gray-600 dark:text-gray-400">
                                {status?.current_base_url || <span className="italic text-gray-400">---</span>}
                            </div>
                        </div>

                        {/* Backup Status */}
                        <div className="p-3 bg-gray-50/80 dark:bg-gray-900/40 rounded-lg border border-dashed border-gray-200 dark:border-white/10">
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <Shield size={10} className="text-gray-400" />
                                <span className="text-[9px] text-gray-400 dark:text-gray-500 uppercase font-bold tracking-wider">
                                    {t('proxy.cursor_sync.status.backup', { defaultValue: '备份' })}
                                </span>
                            </div>
                            <div className="text-[11px] font-medium">
                                {status?.has_backup ? (
                                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                        <CheckCircle2 size={11} />
                                        {t('proxy.cursor_sync.status.backup_exists', { defaultValue: '已备份' })}
                                    </span>
                                ) : (
                                    <span className="text-gray-400 italic">
                                        {t('proxy.cursor_sync.status.no_backup', { defaultValue: '无备份' })}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Config Path (subtle) */}
                    {status?.config_path && (
                        <div className="flex items-center gap-1.5 mb-4 px-1">
                            <FolderOpen size={10} className="text-gray-300 dark:text-gray-600 shrink-0" />
                            <span className="text-[9px] font-mono text-gray-300 dark:text-gray-600 truncate" title={status.config_path}>
                                {status.config_path}
                            </span>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                        {isInstalled && (
                            <>
                                <button
                                    onClick={handleViewConfig}
                                    className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all active:scale-95"
                                    title={t('proxy.cursor_sync.btn_view', { defaultValue: '查看配置' })}
                                >
                                    <Eye size={15} />
                                </button>
                                <button
                                    onClick={handleRestore}
                                    disabled={!status?.has_backup}
                                    className={cn(
                                        "p-2 rounded-lg transition-all active:scale-95",
                                        status?.has_backup
                                            ? "text-gray-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                                            : "text-gray-200 dark:text-gray-700 cursor-not-allowed"
                                    )}
                                    title={status?.has_backup
                                        ? t('proxy.cursor_sync.btn_restore', { defaultValue: '恢复备份' })
                                        : t('proxy.cursor_sync.status.no_backup', { defaultValue: '无备份' })
                                    }
                                >
                                    <RotateCcw size={15} />
                                </button>
                                <button
                                    onClick={() => checkStatus()}
                                    disabled={loading}
                                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all active:scale-95"
                                    title={t('common.refresh', { defaultValue: '刷新' })}
                                >
                                    <RefreshCw size={15} className={cn(loading && "animate-spin")} />
                                </button>
                            </>
                        )}
                        <button
                            onClick={handleSync}
                            disabled={!isInstalled || syncing || loading}
                            className={cn(
                                "btn btn-sm flex-1 gap-2 rounded-xl transition-all font-bold shadow-sm h-10",
                                isConnected
                                    ? "btn-ghost border border-gray-200 dark:border-base-400 text-gray-500 hover:bg-gray-100 dark:hover:bg-base-300"
                                    : "bg-gradient-to-r from-cyan-500 to-teal-600 hover:from-cyan-600 hover:to-teal-700 text-white border-none shadow-lg shadow-cyan-500/20 hover:shadow-xl hover:shadow-cyan-500/30"
                            )}
                        >
                            {syncing ? (
                                <Loader2 size={15} className="animate-spin" />
                            ) : (
                                <MousePointerClick size={15} />
                            )}
                            {isConnected
                                ? t('proxy.cursor_sync.btn_resync', { defaultValue: '重新同步' })
                                : t('proxy.cursor_sync.btn_sync', { defaultValue: '一键同步配置' })
                            }
                        </button>
                    </div>
                </div>
            </div>
