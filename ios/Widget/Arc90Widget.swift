import WidgetKit
import SwiftUI

// Must match the App Group added to BOTH the App and this widget target.
private let arc90AppGroup = "group.com.arc90.app"

// Brand palette (luxury obsidian).
private let arcInk = Color(red: 0.97, green: 0.97, blue: 1.0)
private let arcBG = Color(red: 0.027, green: 0.031, blue: 0.047)
private let arcGrad = LinearGradient(
    colors: [Color(red: 0.37, green: 0.89, blue: 1.0),
             Color(red: 0.56, green: 0.42, blue: 1.0),
             Color(red: 0.76, green: 0.30, blue: 1.0)],
    startPoint: .topLeading, endPoint: .bottomTrailing)

struct Arc90Entry: TimelineEntry {
    let date: Date
    let pct: Int, completed: Int, total: Int, day: Int
    let momentum: Int, readiness: Int?, streak: Int
    let goal: String, hasData: Bool
    let quote: String, quoteSource: String
}

struct Arc90Provider: TimelineProvider {
    func placeholder(in ctx: Context) -> Arc90Entry {
        Arc90Entry(date: Date(), pct: 68, completed: 4, total: 6, day: 31,
                   momentum: 74, readiness: 84, streak: 9, goal: "Arc90", hasData: true,
                   quote: "Energy and persistence conquer all things.", quoteSource: "Benjamin Franklin")
    }
    func getSnapshot(in ctx: Context, completion: @escaping (Arc90Entry) -> Void) { completion(read()) }
    func getTimeline(in ctx: Context, completion: @escaping (Timeline<Arc90Entry>) -> Void) {
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date().addingTimeInterval(1800)
        // The app force-reloads on every snapshot; this is just a safety refresh.
        completion(Timeline(entries: [read()], policy: .after(next)))
    }
    private func read() -> Arc90Entry {
        guard let d = UserDefaults(suiteName: arc90AppGroup)?.data(forKey: "arc90.snapshot"),
              let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] else {
            return Arc90Entry(date: Date(), pct: 0, completed: 0, total: 0, day: 1,
                              momentum: 0, readiness: nil, streak: 0, goal: "Arc90", hasData: false,
                              quote: "", quoteSource: "")
        }
        func int(_ k: String) -> Int { (o[k] as? Int) ?? Int((o[k] as? Double) ?? 0) }
        let readiness: Int? = (o["readiness"] == nil || o["readiness"] is NSNull) ? nil : int("readiness")
        return Arc90Entry(date: Date(), pct: int("pct"), completed: int("completed"),
                          total: int("total"), day: int("day"), momentum: int("momentum"),
                          readiness: readiness, streak: int("streak"),
                          goal: (o["goal"] as? String) ?? "Arc90", hasData: true,
                          quote: (o["quote"] as? String) ?? "", quoteSource: (o["quoteSource"] as? String) ?? "")
    }
}

// Reusable progress ring.
private struct Ring: View {
    let pct: Int
    var lineWidth: CGFloat = 9
    var body: some View {
        ZStack {
            Circle().stroke(Color.white.opacity(0.12), lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: max(0.001, min(1, Double(pct) / 100)))
                .stroke(arcGrad, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
    }
}

// systemSmall / systemMedium home-screen tile.
private struct Arc90HomeView: View {
    let e: Arc90Entry
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("ARC").font(.system(size: 13, weight: .heavy)).foregroundColor(arcInk)
                + Text("90").font(.system(size: 13, weight: .heavy))
                    .foregroundColor(Color(red: 0.56, green: 0.42, blue: 1.0))
                Spacer()
                if e.streak > 0 {
                    Text("🔥 \(e.streak)").font(.system(size: 12, weight: .bold))
                        .foregroundColor(arcInk.opacity(0.85))
                }
            }
            Spacer(minLength: 6)
            HStack(alignment: .center, spacing: 12) {
                ZStack {
                    Ring(pct: e.pct)
                    VStack(spacing: 0) {
                        Text("\(e.pct)").font(.system(size: 24, weight: .black)).foregroundColor(arcInk)
                        Text("today").font(.system(size: 9, weight: .semibold)).foregroundColor(arcInk.opacity(0.5))
                    }
                }
                .frame(width: 74, height: 74)
                VStack(alignment: .leading, spacing: 5) {
                    Stat(label: "Done", value: "\(e.completed)/\(e.total)")
                    Stat(label: "Momentum", value: "\(e.momentum)%")
                    if let r = e.readiness { Stat(label: "Readiness", value: "\(r)") }
                }
            }
            Spacer(minLength: 6)
            Text("Day \(e.day) of 90").font(.system(size: 11, weight: .semibold))
                .foregroundColor(arcInk.opacity(0.55))
        }
        .padding(14)
    }
    private func Stat(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label.uppercased()).font(.system(size: 8, weight: .bold))
                .foregroundColor(arcInk.opacity(0.45)).tracking(0.5)
            Text(value).font(.system(size: 15, weight: .heavy)).foregroundColor(arcInk)
        }
    }
}

struct Arc90WidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: Arc90Entry

    var body: some View {
        switch family {
        case .accessoryCircular:
            ZStack { Ring(pct: entry.pct, lineWidth: 6)
                Text("\(entry.pct)").font(.system(size: 17, weight: .heavy)) }
        case .accessoryInline:
            Text("Arc90 · \(entry.pct)% · Day \(entry.day)")
        case .accessoryRectangular:
            HStack(spacing: 8) {
                Ring(pct: entry.pct, lineWidth: 5).frame(width: 34, height: 34)
                VStack(alignment: .leading, spacing: 1) {
                    Text("Arc90 · Day \(entry.day)").font(.system(size: 13, weight: .heavy))
                    Text("\(entry.completed)/\(entry.total) done" + (entry.streak > 0 ? " · 🔥\(entry.streak)" : ""))
                        .font(.system(size: 12))
                }
            }
        default:
            Arc90HomeView(e: entry)
        }
    }
}

struct Arc90Widget: Widget {
    let kind = "Arc90Widget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Arc90Provider()) { entry in
            if #available(iOS 17.0, *) {
                Arc90WidgetEntryView(entry: entry).containerBackground(arcBG, for: .widget)
            } else {
                Arc90WidgetEntryView(entry: entry).padding(0).background(arcBG)
            }
        }
        .configurationDisplayName("Arc90 · Progress")
        .description("Today's ring, momentum, readiness, and streak.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

// ── Daily reflection widget ──────────────────────────────────────────────────
struct Arc90ReflectionView: View {
    @Environment(\.widgetFamily) var family
    let entry: Arc90Entry
    private var quote: String { entry.quote.isEmpty ? "Build your next 90 days." : entry.quote }
    private var source: String { entry.quoteSource.isEmpty ? "Arc90" : entry.quoteSource }

    var body: some View {
        switch family {
        case .accessoryInline:
            Text("“\(quote)”")
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                Text("DAILY REFLECTION").font(.system(size: 9, weight: .bold)).opacity(0.6)
                Text(quote).font(.system(size: 13, weight: .medium, design: .serif))
                    .lineLimit(3).minimumScaleFactor(0.8)
            }
        default:
            VStack(alignment: .leading, spacing: 0) {
                Text("DAILY REFLECTION").font(.system(size: 9, weight: .bold))
                    .tracking(1).foregroundColor(arcInk.opacity(0.5))
                Spacer(minLength: 8)
                Text("“\(quote)”")
                    .font(.system(size: family == .systemLarge ? 26 : 17, weight: .semibold, design: .serif))
                    .italic().foregroundColor(arcInk)
                    .minimumScaleFactor(0.6)
                    .lineLimit(family == .systemSmall ? 5 : 8)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                HStack {
                    Text("— \(source)").font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Color(red: 0.56, green: 0.42, blue: 1.0))
                        .lineLimit(1)
                    Spacer()
                    Text("Day \(entry.day)").font(.system(size: 11, weight: .semibold))
                        .foregroundColor(arcInk.opacity(0.45))
                }
            }
            .padding(15)
        }
    }
}

struct Arc90ReflectionWidget: Widget {
    let kind = "Arc90ReflectionWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Arc90Provider()) { entry in
            if #available(iOS 17.0, *) {
                Arc90ReflectionView(entry: entry).containerBackground(arcBG, for: .widget)
            } else {
                Arc90ReflectionView(entry: entry).padding(0).background(arcBG)
            }
        }
        .configurationDisplayName("Arc90 · Daily Reflection")
        .description("A new reflection each day of your arc.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular, .accessoryInline])
    }
}

@main
struct Arc90WidgetBundle: WidgetBundle {
    var body: some Widget {
        Arc90Widget()
        Arc90ReflectionWidget()
    }
}
