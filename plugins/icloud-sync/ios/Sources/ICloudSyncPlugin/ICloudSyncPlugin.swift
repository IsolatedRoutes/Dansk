import Capacitor
import Foundation

// Lets the app keep a small amount of text in the person's own iCloud
// (the iCloud "key-value store"), shared by all their devices signed in to
// the same Apple ID. Nothing goes to any server of ours.
@objc(ICloudSyncPlugin)
public class ICloudSyncPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ICloudSyncPlugin"
    public let jsName = "ICloudSync"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "synchronize", returnType: CAPPluginReturnPromise)
    ]
    private let store = NSUbiquitousKeyValueStore.default

    override public func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(storeChanged(_:)),
            name: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
            object: store)
        store.synchronize()
    }

    // The store changed because another device saved something.
    @objc private func storeChanged(_ note: Notification) {
        var keys: [String] = []
        if let changed = note.userInfo?[NSUbiquitousKeyValueStoreChangedKeysKey] as? [String] {
            keys = changed
        }
        notifyListeners("changed", data: ["keys": keys])
    }

    // Is the person signed in to iCloud (and is iCloud allowed for this app)?
    @objc public func status(_ call: CAPPluginCall) {
        call.resolve(["available": FileManager.default.ubiquityIdentityToken != nil])
    }

    @objc public func get(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("Missing key")
            return
        }
        if let value = store.string(forKey: key) {
            call.resolve(["value": value])
        } else {
            call.resolve([:])
        }
    }

    @objc public func set(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), let value = call.getString("value") else {
            call.reject("Missing key or value")
            return
        }
        store.set(value, forKey: key)
        call.resolve()
    }

    @objc public func remove(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("Missing key")
            return
        }
        store.removeObject(forKey: key)
        call.resolve()
    }

    @objc public func synchronize(_ call: CAPPluginCall) {
        call.resolve(["ok": store.synchronize()])
    }
}
