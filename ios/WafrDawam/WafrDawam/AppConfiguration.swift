import Foundation

enum AppConfiguration {
    static let portalURL = URL(string: "https://attendance.xshadox.com/")!

    static func isPortal(_ url: URL) -> Bool {
        url.scheme?.lowercased() == "https" && url.host?.lowercased() == portalURL.host && (url.port == nil || url.port == 443) && url.user == nil && url.password == nil
    }

    static func canOpenExternally(_ url: URL) -> Bool {
        ["https", "mailto", "tel", "whatsapp"].contains(url.scheme?.lowercased() ?? "")
    }
}
