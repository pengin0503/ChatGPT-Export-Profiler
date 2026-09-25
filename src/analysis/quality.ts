export type QualitySeverity = 'fatal' | 'recoverable' | 'warning' | 'unknownSchema';

export interface QualityIssue {
  severity: QualitySeverity;
  code: string;
}

export interface CoverageMetric {
  attempted: number;
  identified: number;
  ratio: number | null;
}

export interface QualitySnapshot {
  fatal: number;
  recoverable: number;
  warning: number;
  unknownSchema: number;
  issues: readonly QualityIssue[];
  unknownSchemaKeys: readonly string[];
  coverage: {
    modelIdentification: CoverageMetric;
    tokenization: CoverageMetric;
  };
}

interface MutableCoverage {
  attempted: number;
  identified: number;
}

function snapshotCoverage(value: MutableCoverage): CoverageMetric {
  return {
    attempted: value.attempted,
    identified: value.identified,
    ratio: value.attempted === 0 ? null : value.identified / value.attempted
  };
}

export class QualityCollector {
  private readonly issues: QualityIssue[] = [];
  private readonly unknownKeys = new Set<string>();
  private fatalCount = 0;
  private recoverableCount = 0;
  private warningCount = 0;
  private unknownSchemaCount = 0;
  private readonly modelCoverage: MutableCoverage = { attempted: 0, identified: 0 };
  private readonly tokenCoverage: MutableCoverage = { attempted: 0, identified: 0 };

  addFatal(code: string): void {
    this.fatalCount += 1;
    this.issues.push({ severity: 'fatal', code });
  }

  addRecoverable(code: string): void {
    this.recoverableCount += 1;
    this.issues.push({ severity: 'recoverable', code });
  }

  addWarning(code: string): void {
    this.warningCount += 1;
    this.issues.push({ severity: 'warning', code });
  }

  addUnknownSchema(key: string): void {
    this.unknownSchemaCount += 1;
    this.unknownKeys.add(key);
    this.issues.push({ severity: 'unknownSchema', code: key });
  }

  recordModelIdentification(identified: boolean): void {
    this.modelCoverage.attempted += 1;
    if (identified) this.modelCoverage.identified += 1;
  }

  recordTokenization(identified: boolean): void {
    this.tokenCoverage.attempted += 1;
    if (identified) this.tokenCoverage.identified += 1;
  }

  snapshot(): QualitySnapshot {
    return {
      fatal: this.fatalCount,
      recoverable: this.recoverableCount,
      warning: this.warningCount,
      unknownSchema: this.unknownSchemaCount,
      issues: [...this.issues],
      unknownSchemaKeys: [...this.unknownKeys].sort(),
      coverage: {
        modelIdentification: snapshotCoverage(this.modelCoverage),
        tokenization: snapshotCoverage(this.tokenCoverage)
      }
    };
  }
}
