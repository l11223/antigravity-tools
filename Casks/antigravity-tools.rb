cask "nexusproxy" do
  version "4.1.15"
  sha256 :no_check

  name "NexusProxy"
  desc "Professional Account Management for AI Services"
  homepage "https://github.com/lbjlaq/nexusproxy"

  on_macos do
    url "https://github.com/lbjlaq/nexusproxy/releases/download/v#{version}/NexusProxy.Tools_#{version}_universal.dmg"

    app "NexusProxy.app"

    zap trash: [
      "~/Library/Application Support/com.lbjlaq.nexusproxy",
      "~/Library/Caches/com.lbjlaq.nexusproxy",
      "~/Library/Preferences/com.lbjlaq.nexusproxy.plist",
      "~/Library/Saved Application State/com.lbjlaq.nexusproxy.savedState",
    ]

    caveats <<~EOS
      If you encounter the "App is damaged" error, please run the following command:
        sudo xattr -rd com.apple.quarantine "/Applications/NexusProxy.app"

      Or install with the --no-quarantine flag:
        brew install --cask --no-quarantine nexusproxy
    EOS
  end

  on_linux do
    arch arm: "aarch64", intel: "amd64"

    url "https://github.com/lbjlaq/nexusproxy/releases/download/v#{version}/NexusProxy.Tools_#{version}_#{arch}.AppImage"
    binary "NexusProxy.Tools_#{version}_#{arch}.AppImage", target: "nexusproxy"

    preflight do
      system_command "/bin/chmod", args: ["+x", "#{staged_path}/NexusProxy.Tools_#{version}_#{arch}.AppImage"]
    end
  end
end
