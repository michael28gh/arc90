import SwiftUI
import WatchConnectivity

@main
struct Arc90WatchApp: App {
    @StateObject private var model = Arc90WatchModel()

    var body: some Scene {
        WindowGroup {
            WatchDashboardView()
                .environmentObject(model)
                .onAppear { model.activate() }
        }
    }
}

struct Arc90WatchSummary {
    var day = 1
    var date = "Today"
    var momentum = 0
    var completed = 0
    var total = 0
    var goal = "Arc90"
    var habits: [Arc90WatchHabit] = []
    var water = 0
    var waterGoal = 8
    var sleepHours: Double?
    var nextProtocol = ""
}

struct Arc90WatchHabit: Identifiable {
    let id: String
    let emoji: String
    let name: String
    let status: String
    let min: String
}

final class Arc90WatchModel: NSObject, ObservableObject, WCSessionDelegate {
    @Published var summary = Arc90WatchSummary()
    @Published var reachable = false

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    func mark(_ habit: Arc90WatchHabit, status: String = "done") {
        send(["action": "toggleHabit", "id": habit.id, "status": status])
    }

    func addWater() {
        send(["action": "water", "delta": 1])
    }

    func requestSnapshot() {
        send(["action": "requestSnapshot"])
    }

    private func send(_ message: [String: Any]) {
        guard WCSession.default.isReachable else {
            try? WCSession.default.updateApplicationContext(message)
            return
        }
        WCSession.default.sendMessage(message, replyHandler: nil, errorHandler: nil)
    }

    private func apply(_ message: [String: Any]) {
        let container = message["summary"] as? [String: Any] ?? message
        let health = container["health"] as? [String: Any] ?? [:]
        let protocols = container["protocols"] as? [String: Any] ?? [:]
        let rawHabits = container["habits"] as? [[String: Any]] ?? []
        let habits = rawHabits.map {
            Arc90WatchHabit(
                id: String(describing: $0["id"] ?? ""),
                emoji: String(describing: $0["emoji"] ?? ""),
                name: String(describing: $0["name"] ?? "Habit"),
                status: String(describing: $0["status"] ?? "open"),
                min: String(describing: $0["min"] ?? "minimum")
            )
        }

        DispatchQueue.main.async {
            self.summary = Arc90WatchSummary(
                day: container["day"] as? Int ?? 1,
                date: container["date"] as? String ?? "Today",
                momentum: container["momentum"] as? Int ?? 0,
                completed: container["completed"] as? Int ?? 0,
                total: container["total"] as? Int ?? habits.count,
                goal: container["goal"] as? String ?? "Arc90",
                habits: habits,
                water: health["water"] as? Int ?? 0,
                waterGoal: health["waterGoal"] as? Int ?? 8,
                sleepHours: health["sleepHours"] as? Double,
                nextProtocol: protocols["next"] as? String ?? ""
            )
        }
    }

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        DispatchQueue.main.async {
            self.reachable = session.isReachable
        }
        requestSnapshot()
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async {
            self.reachable = session.isReachable
        }
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        apply(applicationContext)
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        apply(message)
    }
}

struct WatchDashboardView: View {
    @EnvironmentObject private var model: Arc90WatchModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                header
                momentumCard
                habitList
                signalGrid
            }
            .padding(.horizontal, 2)
        }
        .background(Color.black)
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("ARC90")
                    .font(.system(size: 13, weight: .heavy, design: .rounded))
                    .foregroundStyle(.arcRed)
                Text(model.summary.date)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.arcMuted)
            }
            Spacer()
            Circle()
                .fill(model.reachable ? Color.arcRed : Color.arcGraphite)
                .frame(width: 8, height: 8)
        }
    }

    private var momentumCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center) {
                ZStack {
                    Circle()
                        .stroke(Color.arcGraphite, lineWidth: 8)
                    Circle()
                        .trim(from: 0, to: CGFloat(model.summary.momentum) / 100)
                        .stroke(Color.arcRed, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    Text("\(model.summary.momentum)%")
                        .font(.system(size: 20, weight: .black, design: .rounded))
                }
                .frame(width: 70, height: 70)

                VStack(alignment: .leading, spacing: 3) {
                    Text("Day \(model.summary.day)")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(.arcMuted)
                    Text("\(model.summary.completed)/\(model.summary.total)")
                        .font(.system(size: 30, weight: .black, design: .rounded))
                    Text(model.summary.goal)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.arcMuted)
                        .lineLimit(2)
                }
            }
        }
        .padding(12)
        .background(Color.arcPanel)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private var habitList: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Today")
                .font(.system(size: 12, weight: .heavy))
                .foregroundStyle(.arcCream)
            ForEach(model.summary.habits.prefix(6)) { habit in
                HStack(spacing: 8) {
                    Text(habit.emoji)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(habit.name)
                            .font(.system(size: 12, weight: .bold))
                            .lineLimit(1)
                        Text(habit.status == "open" ? habit.min : habit.status)
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundStyle(.arcMuted)
                            .lineLimit(1)
                    }
                    Spacer()
                    Button {
                        model.mark(habit, status: habit.status == "open" ? "done" : "min")
                    } label: {
                        Image(systemName: habit.status == "open" ? "checkmark" : "arrow.up.right")
                            .font(.system(size: 11, weight: .black))
                    }
                    .buttonStyle(.borderless)
                    .tint(.arcRed)
                }
                .padding(9)
                .background(Color.arcPanel)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
        }
    }

    private var signalGrid: some View {
        HStack(spacing: 8) {
            signal(title: "Water", value: "\(model.summary.water)/\(model.summary.waterGoal)", action: model.addWater)
            signal(title: "Sleep", value: model.summary.sleepHours.map { String(format: "%.1fh", $0) } ?? "--", action: model.requestSnapshot)
            signal(title: "Protocol", value: model.summary.nextProtocol.isEmpty ? "--" : model.summary.nextProtocol, action: model.requestSnapshot)
        }
    }

    private func signal(title: String, value: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title.uppercased())
                    .font(.system(size: 8, weight: .black))
                    .foregroundStyle(.arcMuted)
                Text(value)
                    .font(.system(size: 12, weight: .heavy))
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(8)
            .background(Color.arcPanel)
            .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

extension Color {
    static let arcRed = Color(red: 1.0, green: 0.23, blue: 0.25)
    static let arcCream = Color(red: 0.96, green: 0.95, blue: 0.91)
    static let arcMuted = Color(red: 0.64, green: 0.62, blue: 0.58)
    static let arcGraphite = Color(red: 0.22, green: 0.22, blue: 0.21)
    static let arcPanel = Color(red: 0.08, green: 0.08, blue: 0.08)
}
