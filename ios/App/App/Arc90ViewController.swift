import UIKit
import Capacitor

/// App-local plugin registration (Capacitor 6+ pattern): the storyboard's
/// root view controller is this subclass so in-app plugins come alive.
class Arc90ViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(Arc90HealthPlugin())
    }
}
