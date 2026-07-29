// Acumula el resultado de la corrida y lo imprime al final.

export class Report {
  private counts = new Map<string, number>();
  private anomalies: string[] = [];

  bump(table: string, n = 1): void {
    this.counts.set(table, (this.counts.get(table) ?? 0) + n);
  }

  anomaly(msg: string): void {
    this.anomalies.push(msg);
  }

  print(opts: { dryRun: boolean }): void {
    const line = "─".repeat(52);
    console.log(`\n${line}`);
    console.log(opts.dryRun ? "PLAN (dry-run, nada escrito)" : "RESULTADO DE LA MIGRACIÓN");
    console.log(line);
    if (this.counts.size === 0) {
      console.log("  (sin filas)");
    } else {
      for (const [table, n] of this.counts) {
        console.log(`  ${table.padEnd(20)} ${n}`);
      }
    }
    console.log(line);
    if (this.anomalies.length === 0) {
      console.log("Anomalías: ninguna ✓");
    } else {
      console.log(`Anomalías (${this.anomalies.length}):`);
      for (const a of this.anomalies) console.log(`  ⚠ ${a}`);
    }
    console.log(`${line}\n`);
  }
}
