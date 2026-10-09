import UIKit
import UniformTypeIdentifiers

// "Share to Broen": appears in the iPhone share sheet. It saves the shared
// text or photo into a folder only Broen and this extension can see (an App
// Group), then opens Broen straight away. If the phone won't let it, Broen picks
// the item up the next time it is opened.
class ShareViewController: UIViewController {
    private let groupId = "group.com.isolatedroutes.broen"
    private let label = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor.systemBackground
        label.text = "Sending to Broen…"
        label.textAlignment = .center
        label.numberOfLines = 0
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            label.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            label.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24)
        ])
        collect()
    }

    private func inboxDir() -> URL? {
        guard let base = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupId) else {
            return nil
        }
        let dir = base.appendingPathComponent("share-inbox", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private func collect() {
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        var providers: [NSItemProvider] = []
        for item in items { providers.append(contentsOf: item.attachments ?? []) }

        let group = DispatchGroup()
        var textParts: [String] = []
        var imageData: Data?
        var imageType = "image/jpeg"
        let lock = NSLock()

        for p in providers {
            if p.hasItemConformingToTypeIdentifier(UTType.image.identifier) && imageData == nil {
                group.enter()
                p.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier) { data, _ in
                    if let data = data {
                        lock.lock()
                        imageData = data
                        if data.starts(with: [0x89, 0x50, 0x4E, 0x47]) { imageType = "image/png" }
                        lock.unlock()
                    }
                    group.leave()
                }
            } else if p.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                group.enter()
                p.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { value, _ in
                    if let s = value as? String {
                        lock.lock(); textParts.append(s); lock.unlock()
                    }
                    group.leave()
                }
            } else if p.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                group.enter()
                p.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { value, _ in
                    if let u = value as? URL {
                        lock.lock(); textParts.append(u.absoluteString); lock.unlock()
                    }
                    group.leave()
                }
            }
        }

        group.notify(queue: .main) {
            self.save(text: textParts.joined(separator: "\n\n"), image: imageData, imageType: imageType)
        }
    }

    private func save(text: String, image: Data?, imageType: String) {
        guard let dir = inboxDir() else {
            finish(message: "Broen isn't set up to receive shares yet.")
            return
        }
        let textFile = dir.appendingPathComponent("text.txt")
        let imageFile = dir.appendingPathComponent("image.bin")
        let typeFile = dir.appendingPathComponent("image.type")
        for f in [textFile, imageFile, typeFile] { try? FileManager.default.removeItem(at: f) }
        var saved = false
        if !text.isEmpty {
            try? text.data(using: .utf8)?.write(to: textFile)
            saved = true
        }
        if let image = image {
            try? image.write(to: imageFile)
            try? imageType.data(using: .utf8)?.write(to: typeFile)
            saved = true
        }
        if !saved {
            finish(message: "Nothing to send. Broen takes text and photos.")
            return
        }
        openBroen()
        finish(message: "Opening Broen…")
    }

    // Opens Broen straight away. A share extension isn't allowed to open apps
    // directly, so this finds the phone's own "open a link" call further up
    // the chain and uses it with Broen's link (broen://share). If the phone
    // refuses, Broen still picks the item up the next time it opens.
    private func openBroen() {
        guard let url = URL(string: "broen://share") else { return }
        let modern = NSSelectorFromString("openURL:options:completionHandler:")
        let legacy = NSSelectorFromString("openURL:")
        var responder: UIResponder? = self
        while let r = responder {
            if r.responds(to: modern), let imp = r.method(for: modern) {
                typealias OpenFn = @convention(c) (AnyObject, Selector, URL, [UIApplication.OpenExternalURLOptionsKey: Any], ((Bool) -> Void)?) -> Void
                let open = unsafeBitCast(imp, to: OpenFn.self)
                open(r, modern, url, [:], nil)
                return
            }
            if r.responds(to: legacy) {
                _ = r.perform(legacy, with: url)
                return
            }
            responder = r.next
        }
    }

    private func finish(message: String) {
        label.text = message
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
            self.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
        }
    }
}
