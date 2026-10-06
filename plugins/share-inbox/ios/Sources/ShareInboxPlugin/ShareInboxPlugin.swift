import Capacitor
import Foundation

// Picks up what the person shared to Broen from another app. The small
// "Share to Broen" extension drops the text or photo in a folder that only
// Broen and that extension can see (an App Group); this plugin hands it to
// the page once and then deletes it. Nothing leaves the phone here.
// With no App Group set up yet it simply reports nothing shared.
@objc(ShareInboxPlugin)
public class ShareInboxPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ShareInboxPlugin"
    public let jsName = "ShareInbox"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "take", returnType: CAPPluginReturnPromise)
    ]
    // Must match the App Group ticked in Xcode for both Broen and the extension.
    private let groupId = "group.com.isolatedroutes.broen"

    private func inbox() -> URL? {
        guard let base = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupId) else {
            return nil
        }
        return base.appendingPathComponent("share-inbox", isDirectory: true)
    }

    // Returns {text?, imageBase64?, imageType?} and clears the inbox.
    @objc public func take(_ call: CAPPluginCall) {
        guard let dir = inbox() else {
            call.resolve([:])
            return
        }
        var result: [String: Any] = [:]
        let textFile = dir.appendingPathComponent("text.txt")
        let imageFile = dir.appendingPathComponent("image.bin")
        let typeFile = dir.appendingPathComponent("image.type")
        if let data = try? Data(contentsOf: textFile), let text = String(data: data, encoding: .utf8), !text.isEmpty {
            result["text"] = text
        }
        if let data = try? Data(contentsOf: imageFile), !data.isEmpty {
            result["imageBase64"] = data.base64EncodedString()
            if let t = try? String(contentsOf: typeFile, encoding: .utf8), !t.isEmpty {
                result["imageType"] = t
            } else {
                result["imageType"] = "image/jpeg"
            }
        }
        for f in [textFile, imageFile, typeFile] {
            try? FileManager.default.removeItem(at: f)
        }
        call.resolve(result)
    }
}
