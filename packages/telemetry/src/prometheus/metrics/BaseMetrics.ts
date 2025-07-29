import { Counter, Gauge, Histogram, Registry } from "prom-client"

class BaseMetrics {
	private readonly registry: Registry
	constructor(registry: Registry) {
		this.registry = registry
	}
	createCounter(name: string, help: string, labels: string[]): Counter<string> {
		return new Counter({
			name,
			help,
			labelNames: labels,
			registers: [this.registry],
		})
	}
	createGauge(name: string, help: string, labels: string[]): Gauge<string> {
		return new Gauge({
			name,
			help,
			labelNames: labels,
			registers: [this.registry],
		})
	}
	createHistogram(name: string, help: string, labels: string[]): Histogram<string> {
		return new Histogram({
			name,
			help,
			labelNames: labels,
			registers: [this.registry],
		})
	}
}

export default BaseMetrics
