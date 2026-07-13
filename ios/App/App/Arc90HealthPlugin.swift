import Foundation
import Capacitor
import HealthKit

/// Native HealthKit bridge. JS contract (already shipped in app.js):
///   window.Capacitor.Plugins.Arc90Health.sync({ date, stepGoal })
///     -> { date, steps, weight, water, sleepHours, sleepQuality,
///          history: [{ date, steps, weight, water, sleepHours, sleepQuality, rhr, hrv, vo2 }] }
/// Read-only. Weight is kilograms; water is glasses (250 ml); sleep is hours.
@objc(Arc90HealthPlugin)
public class Arc90HealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "Arc90HealthPlugin"
    public let jsName = "Arc90Health"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise)
    ]

    private let store = HKHealthStore()
    private let daysBack = 14

    private var dayFormatter: DateFormatter {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.calendar = Calendar.current
        f.timeZone = TimeZone.current
        return f
    }

    @objc func sync(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("Health data is not available on this device.")
            return
        }
        var read: Set<HKObjectType> = []
        let quantityIds: [HKQuantityTypeIdentifier] = [
            .stepCount, .bodyMass, .dietaryWater, .restingHeartRate, .heartRateVariabilitySDNN, .vo2Max,
        ]
        for id in quantityIds {
            if let t = HKQuantityType.quantityType(forIdentifier: id) { read.insert(t) }
        }
        if let sleep = HKCategoryType.categoryType(forIdentifier: .sleepAnalysis) { read.insert(sleep) }

        // Plugin calls arrive on a background queue; the authorization sheet is UI.
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.store.requestAuthorization(toShare: nil, read: read) { _, error in
                // Read authorization status is intentionally opaque in HealthKit;
                // unauthorized types simply return no samples.
                if let error = error {
                    call.reject("Health authorization failed: \(error.localizedDescription)")
                    return
                }
                self.gather(call)
            }
        }
    }

    private func gather(_ call: CAPPluginCall) {
        let cal = Calendar.current
        let todayStart = cal.startOfDay(for: Date())
        guard let windowStart = cal.date(byAdding: .day, value: -(daysBack - 1), to: todayStart),
              let windowEnd = cal.date(byAdding: .day, value: 1, to: todayStart) else {
            call.reject("Date math failed.")
            return
        }
        let fmt = dayFormatter
        var days: [String: [String: Any]] = [:]
        for i in 0..<daysBack {
            if let d = cal.date(byAdding: .day, value: i, to: windowStart) {
                days[fmt.string(from: d)] = ["date": fmt.string(from: d)]
            }
        }
        let lock = NSLock()
        let group = DispatchGroup()

        func put(_ dayKey: String, _ field: String, _ value: Any) {
            lock.lock()
            if days[dayKey] != nil { days[dayKey]?[field] = value }
            lock.unlock()
        }

        // Daily cumulative sums: steps, water.
        let sums: [(HKQuantityTypeIdentifier, String, HKUnit, (Double) -> Any)] = [
            (.stepCount, "steps", .count(), { Int($0.rounded()) }),
            (.dietaryWater, "water", .literUnit(with: .milli), { Int(($0 / 250.0).rounded()) }), // glasses
        ]
        for (id, field, unit, map) in sums {
            guard let type = HKQuantityType.quantityType(forIdentifier: id) else { continue }
            group.enter()
            let q = HKStatisticsCollectionQuery(
                quantityType: type,
                quantitySamplePredicate: HKQuery.predicateForSamples(withStart: windowStart, end: windowEnd, options: .strictStartDate),
                options: .cumulativeSum,
                anchorDate: todayStart,
                intervalComponents: DateComponents(day: 1)
            )
            q.initialResultsHandler = { _, results, _ in
                results?.enumerateStatistics(from: windowStart, to: windowEnd) { stat, _ in
                    if let sum = stat.sumQuantity() {
                        let v = sum.doubleValue(for: unit)
                        if v > 0 { put(fmt.string(from: stat.startDate), field, map(v)) }
                    }
                }
                group.leave()
            }
            store.execute(q)
        }

        // Daily discrete averages: resting HR, HRV, VO2 max.
        let vo2Unit = HKUnit.literUnit(with: .milli)
            .unitDivided(by: HKUnit.gramUnit(with: .kilo).unitMultiplied(by: .minute()))
        let avgs: [(HKQuantityTypeIdentifier, String, HKUnit, (Double) -> Any)] = [
            (.restingHeartRate, "rhr", HKUnit.count().unitDivided(by: .minute()), { Int($0.rounded()) }),
            (.heartRateVariabilitySDNN, "hrv", .secondUnit(with: .milli), { Int($0.rounded()) }),
            (.vo2Max, "vo2", vo2Unit, { (($0 * 10).rounded()) / 10 }),
        ]
        for (id, field, unit, map) in avgs {
            guard let type = HKQuantityType.quantityType(forIdentifier: id) else { continue }
            group.enter()
            let q = HKStatisticsCollectionQuery(
                quantityType: type,
                quantitySamplePredicate: HKQuery.predicateForSamples(withStart: windowStart, end: windowEnd, options: .strictStartDate),
                options: .discreteAverage,
                anchorDate: todayStart,
                intervalComponents: DateComponents(day: 1)
            )
            q.initialResultsHandler = { _, results, _ in
                results?.enumerateStatistics(from: windowStart, to: windowEnd) { stat, _ in
                    if let avg = stat.averageQuantity() {
                        put(fmt.string(from: stat.startDate), field, map(avg.doubleValue(for: unit)))
                    }
                }
                group.leave()
            }
            store.execute(q)
        }

        // Weight: latest sample per day, in kilograms.
        if let type = HKQuantityType.quantityType(forIdentifier: .bodyMass) {
            group.enter()
            let q = HKSampleQuery(
                sampleType: type,
                predicate: HKQuery.predicateForSamples(withStart: windowStart, end: windowEnd, options: .strictStartDate),
                limit: 60,
                sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: true)]
            ) { _, samples, _ in
                for s in (samples as? [HKQuantitySample]) ?? [] {
                    let kg = s.quantity.doubleValue(for: .gramUnit(with: .kilo))
                    put(fmt.string(from: s.endDate), "weight", String(format: "%.1f", kg))
                }
                group.leave()
            }
            store.execute(q)
        }

        // Sleep: sum asleep hours per night, attributed to the morning it ends.
        if let type = HKCategoryType.categoryType(forIdentifier: .sleepAnalysis) {
            group.enter()
            let q = HKSampleQuery(
                sampleType: type,
                predicate: HKQuery.predicateForSamples(withStart: cal.date(byAdding: .hour, value: -18, to: windowStart), end: windowEnd, options: []),
                limit: HKObjectQueryNoLimit,
                sortDescriptors: nil
            ) { _, samples, _ in
                var asleepSec: [String: Double] = [:]
                var deepSec: [String: Double] = [:]
                for s in (samples as? [HKCategorySample]) ?? [] {
                    let v = s.value
                    let inBed = HKCategoryValueSleepAnalysis.inBed.rawValue
                    let awake = HKCategoryValueSleepAnalysis.awake.rawValue
                    guard v != inBed && v != awake else { continue }
                    let key = fmt.string(from: s.endDate)
                    let dur = s.endDate.timeIntervalSince(s.startDate)
                    asleepSec[key, default: 0] += dur
                    if #available(iOS 16.0, *) {
                        if v == HKCategoryValueSleepAnalysis.asleepDeep.rawValue || v == HKCategoryValueSleepAnalysis.asleepREM.rawValue {
                            deepSec[key, default: 0] += dur
                        }
                    }
                }
                for (key, sec) in asleepSec {
                    let hours = (sec / 360.0).rounded() / 10.0   // 0.1h precision
                    guard hours >= 0.5 else { continue }
                    put(key, "sleepHours", hours)
                    let frac = sec > 0 ? (deepSec[key] ?? 0) / sec : 0
                    let quality = frac >= 0.28 ? "strong" : frac >= 0.18 ? "steady" : frac > 0 ? "light" : "steady"
                    put(key, "sleepQuality", quality)
                }
                group.leave()
            }
            store.execute(q)
        }

        group.notify(queue: .main) {
            let todayKeyStr = fmt.string(from: Date())
            let history = days.values
                .sorted { ($0["date"] as? String ?? "") < ($1["date"] as? String ?? "") }
            var result: [String: Any] = ["date": todayKeyStr, "history": history]
            if let today = days[todayKeyStr] {
                for (k, v) in today where k != "date" { result[k] = v }
            }
            call.resolve(result)
        }
    }
}
