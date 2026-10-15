import UIKit
import WebKit

/// App host: HTTPS and the original origin preserve the website's API/session boundary.
/// Remote pages receive no native filesystem, token, location or notification bridge.
final class PortalViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private let startURL: URL
    private let popup: Bool
    private let webView: WKWebView
    private var progressObservation: NSKeyValueObservation?
    private let progress = UIProgressView(progressViewStyle: .default)
    private let errorPanel = UIStackView()

    init(url: URL, configuration: WKWebViewConfiguration? = nil, popup: Bool = false) {
        self.startURL = url
        self.popup = popup
        let config = configuration ?? WKWebViewConfiguration()
        if configuration == nil { config.websiteDataStore = .default() }
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.applicationNameForUserAgent = "WafrDawam-iOS"
        webView = WKWebView(frame: .zero, configuration: config)
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("Use init(url:)") }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = popup ? "المستند" : "وفر دوام"
        view.backgroundColor = .systemBackground
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.translatesAutoresizingMaskIntoConstraints = false
        progress.translatesAutoresizingMaskIntoConstraints = false
        progress.tintColor = .systemTeal
        view.addSubview(webView)
        view.addSubview(progress)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            progress.topAnchor.constraint(equalTo: webView.topAnchor),
            progress.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            progress.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
        configureErrorPanel()
        navigationItem.rightBarButtonItems = [
            UIBarButtonItem(image: UIImage(systemName: "ellipsis.circle"), menu: makeMenu()),
            UIBarButtonItem(image: UIImage(systemName: "arrow.clockwise"), style: .plain, target: self, action: #selector(reloadPage))
        ]
        navigationItem.rightBarButtonItems?.last?.accessibilityLabel = "تحديث الصفحة"
        if popup {
            navigationItem.leftBarButtonItem = UIBarButtonItem(title: "إغلاق", style: .done, target: self, action: #selector(closePopup))
        }
        progressObservation = webView.observe(\.estimatedProgress, options: [.new]) { [weak self] webView, _ in
            guard let self else { return }
            self.progress.progress = Float(webView.estimatedProgress)
            self.progress.isHidden = webView.estimatedProgress >= 1
        }
        if !popup { webView.load(URLRequest(url: startURL)) }
    }

    private func makeMenu() -> UIMenu {
        UIMenu(children: [
            UIAction(title: "رجوع", image: UIImage(systemName: "chevron.backward")) { [weak self] _ in self?.webView.goBack() },
            UIAction(title: "فتح في Safari", image: UIImage(systemName: "safari")) { [weak self] _ in
                guard let self else { return }
                let url = self.webView.url.flatMap { AppConfiguration.isPortal($0) ? $0 : nil } ?? AppConfiguration.portalURL
                UIApplication.shared.open(url)
            },
            UIAction(title: "طباعة الصفحة", image: UIImage(systemName: "printer")) { [weak self] _ in self?.printPage() },
            UIAction(title: "مشاركة PDF للصفحة", image: UIImage(systemName: "square.and.arrow.up")) { [weak self] _ in self?.sharePDF() },
            UIAction(title: "عن وفر دوام", image: UIImage(systemName: "info.circle")) { [weak self] _ in
                self?.showAlert(title: "وفر دوام", message: "وفر دوام لإدارة الجدول والحضور والطلبات. يحتاج اتصالًا بالإنترنت، وتتوفر خدمات الموقع أثناء استخدام التطبيق. يمكنك فتح بوابة النظام في Safari عند الحاجة، وقد يتطلب ذلك تسجيل الدخول مجددًا.")
            }
        ])
    }

    private func configureErrorPanel() {
        errorPanel.axis = .vertical
        errorPanel.spacing = 16
        errorPanel.alignment = .center
        errorPanel.backgroundColor = .systemBackground
        errorPanel.isLayoutMarginsRelativeArrangement = true
        errorPanel.layoutMargins = UIEdgeInsets(top: 24, left: 24, bottom: 24, right: 24)
        errorPanel.layer.cornerRadius = 18
        errorPanel.translatesAutoresizingMaskIntoConstraints = false
        let label = UILabel()
        label.text = "تعذر الاتصال بوفر دوام. تحقق من الإنترنت ثم أعد المحاولة."
        label.numberOfLines = 0
        label.textAlignment = .center
        let retry = UIButton(type: .system)
        retry.setTitle("إعادة المحاولة", for: .normal)
        retry.addTarget(self, action: #selector(reloadPage), for: .touchUpInside)
        errorPanel.addArrangedSubview(label)
        errorPanel.addArrangedSubview(retry)
        view.addSubview(errorPanel)
        NSLayoutConstraint.activate([
            errorPanel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            errorPanel.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            errorPanel.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 24),
            errorPanel.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -24)
        ])
        errorPanel.isHidden = true
    }

    @objc private func reloadPage() {
        errorPanel.isHidden = true
        if webView.url != nil { webView.reload() } else { webView.load(URLRequest(url: startURL)) }
    }

    @objc private func closePopup() { dismiss(animated: true) }

    private func showAlert(title: String, message: String) {
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "حسنًا", style: .default))
        present(alert, animated: true)
    }

    private func printPage() {
        let printer = UIPrintInteractionController.shared
        let info = UIPrintInfo(dictionary: nil)
        info.jobName = "وفر دوام"
        printer.printInfo = info
        printer.printFormatter = webView.viewPrintFormatter()
        printer.present(from: navigationItem.rightBarButtonItems!.first!, animated: true, completionHandler: nil)
    }

    private func sharePDF() {
        webView.createPDF(configuration: WKPDFConfiguration()) { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let data):
                do {
                    let folder = FileManager.default.temporaryDirectory.appendingPathComponent("wafr-" + UUID().uuidString, isDirectory: true)
                    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                    let file = folder.appendingPathComponent("Wafr-Dawam.pdf")
                    try data.write(to: file, options: .atomic)
                    let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
                    sheet.popoverPresentationController?.barButtonItem = self.navigationItem.rightBarButtonItems?.first
                    sheet.completionWithItemsHandler = { _, _, _, _ in try? FileManager.default.removeItem(at: folder) }
                    self.present(sheet, animated: true)
                } catch { self.showAlert(title: "المشاركة", message: "تعذر تجهيز الملف؛ حاول مجددًا.") }
            case .failure:
                self.showAlert(title: "المشاركة", message: "تعذر تجهيز الصفحة؛ انتظر اكتمال التحميل ثم حاول مجددًا.")
            }
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        let generatedDocument = url.absoluteString == "about:blank" || (url.scheme == "blob" && URL(string: String(url.absoluteString.dropFirst(5))).map(AppConfiguration.isPortal) == true)
        let portalPopupRequest = navigationAction.targetFrame == nil && navigationAction.sourceFrame.securityOrigin.host == AppConfiguration.portalURL.host
        if AppConfiguration.isPortal(url) || (generatedDocument && (popup || portalPopupRequest)) {
            decisionHandler(.allow)
            return
        }
        // Never load a foreign origin in this app's session or launch automatic redirects externally.
        if navigationAction.navigationType == .linkActivated && AppConfiguration.canOpenExternally(url) {
            UIApplication.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard navigationAction.targetFrame == nil, let url = navigationAction.request.url,
              AppConfiguration.isPortal(url) || url.absoluteString == "about:blank" || url.scheme == "blob" else {
            if let url = navigationAction.request.url, navigationAction.navigationType == .linkActivated, AppConfiguration.canOpenExternally(url) { UIApplication.shared.open(url) }
            return nil
        }
        let child = PortalViewController(url: AppConfiguration.portalURL, configuration: configuration, popup: true)
        let navigation = UINavigationController(rootViewController: child)
        navigation.modalPresentationStyle = .fullScreen
        present(navigation, animated: true)
        child.loadViewIfNeeded()
        return child.webView
    }

    func webViewDidClose(_ webView: WKWebView) { if popup { closePopup() } }
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { errorPanel.isHidden = true }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { showLoadError(error) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { showLoadError(error) }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { errorPanel.isHidden = false }
    private func showLoadError(_ error: Error) { if (error as NSError).code != NSURLErrorCancelled { errorPanel.isHidden = false } }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: "وفر دوام", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "حسنًا", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: "تأكيد", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "تأكيد", style: .default) { _ in completionHandler(true) })
        alert.addAction(UIAlertAction(title: "إلغاء", style: .cancel) { _ in completionHandler(false) })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: "وفر دوام", message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "حفظ", style: .default) { _ in completionHandler(alert.textFields?.first?.text) })
        alert.addAction(UIAlertAction(title: "إلغاء", style: .cancel) { _ in completionHandler(nil) })
        present(alert, animated: true)
    }
}
