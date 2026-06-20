import UIKit
import Capacitor
import WatchConnectivity
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        Arc90WatchBridge.shared.start()
        DispatchQueue.main.async {
            Arc90WatchBridge.shared.attach(to: self.window?.rootViewController)
        }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        Arc90WatchBridge.shared.attach(to: window?.rootViewController)
        Arc90WatchBridge.shared.publishStatus()
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

final class Arc90WatchBridge: NSObject, WCSessionDelegate, WKScriptMessageHandler {
    static let shared = Arc90WatchBridge()

    private weak var webView: WKWebView?
    private var latestSummary: [String: Any] = [:]

    func start() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    func attach(to rootViewController: UIViewController?) {
        guard let bridgeController = findBridgeController(in: rootViewController),
              let currentWebView = bridgeController.webView else { return }
        if webView === currentWebView { return }
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "arc90Watch")
        currentWebView.configuration.userContentController.add(self, name: "arc90Watch")
        webView = currentWebView
        publishStatus()
    }

    func publishStatus() {
        guard let webView else { return }
        let payload: [String: Any] = [
            "available": WCSession.isSupported(),
            "paired": WCSession.isSupported() ? WCSession.default.isPaired : false,
            "installed": WCSession.isSupported() ? WCSession.default.isWatchAppInstalled : false,
            "reachable": WCSession.isSupported() ? WCSession.default.isReachable : false
        ]
        evaluate("__arc90WatchStatus", payload, on: webView)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "arc90Watch",
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        if action == "snapshot" {
            let summary = body["summary"] as? [String: Any] ?? [:]
            latestSummary = summary
            sendSummaryToWatch(summary)
        }

        if action == "ping" {
            publishStatus()
        }
    }

    private func sendSummaryToWatch(_ summary: [String: Any]) {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        let payload: [String: Any] = [
            "type": "arc90.snapshot",
            "summary": summary,
            "sentAt": ISO8601DateFormatter().string(from: Date())
        ]
        try? session.updateApplicationContext(payload)
        if session.isReachable {
            session.sendMessage(payload, replyHandler: nil, errorHandler: nil)
        }
    }

    private func deliverWatchActionToWeb(_ action: [String: Any]) {
        guard let webView else { return }
        evaluate("__arc90WatchMessage", action, on: webView)
    }

    private func evaluate(_ functionName: String, _ payload: [String: Any], on webView: WKWebView) {
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        DispatchQueue.main.async {
            webView.evaluateJavaScript("window.\(functionName) && window.\(functionName)(\(json));", completionHandler: nil)
        }
    }

    private func findBridgeController(in root: UIViewController?) -> CAPBridgeViewController? {
        if let bridge = root as? CAPBridgeViewController { return bridge }
        if let presented = root?.presentedViewController, let bridge = findBridgeController(in: presented) { return bridge }
        for child in root?.children ?? [] {
            if let bridge = findBridgeController(in: child) { return bridge }
        }
        return nil
    }

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        publishStatus()
        if !latestSummary.isEmpty {
            sendSummaryToWatch(latestSummary)
        }
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        publishStatus()
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        WCSession.default.activate()
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        deliverWatchActionToWeb(message)
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        deliverWatchActionToWeb(message)
        replyHandler(["ok": true])
    }
}
