import { getArlAlertService } from '../services/arl-alert.service';
import type { ArlDailyCheckSummaryDTO } from '../../types';

/**
 * RN01 - Periodicidad del chequeo:
 * Tarea programada (Cron Job / Worker) para evaluación diaria de registros de ARL
 * en base de datos, programada para ejecutarse una vez al día a la medianoche (00:00 hrs).
 */
export const ARL_ALERTS_CRON_EXPRESSION = '0 0 * * *';

export interface ArlAlertsCronJobStatus {
  cronExpression: string;
  isRunning: boolean;
  isScheduled: boolean;
  lastRunAt: Date | null;
  lastSummary: ArlDailyCheckSummaryDTO | null;
  nextScheduledDescription: string;
}

export class ArlAlertsCronWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private isExecuting = false;
  private lastRunAt: Date | null = null;
  private lastSummary: ArlDailyCheckSummaryDTO | null = null;

  /**
   * Ejecuta inmediatamente una corrida del proceso batch diario de evaluación de ARL (RN01).
   */
  async runDailyCheck(referenceDate: Date = new Date()): Promise<ArlDailyCheckSummaryDTO> {
    if (this.isExecuting) {
      if (this.lastSummary) {
        return this.lastSummary;
      }
    }

    this.isExecuting = true;
    try {
      const service = getArlAlertService();
      const summary = await service.runDailyArlAlertsBatchJob(referenceDate);
      this.lastRunAt = new Date(summary.executedAt);
      this.lastSummary = summary;
      return summary;
    } finally {
      this.isExecuting = false;
    }
  }

  /**
   * Inicia el worker programado para chequear diariamente a las 00:00 hrs (RN01).
   */
  start(intervalMs = 24 * 60 * 60 * 1000): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.runDailyCheck(new Date());
    }, intervalMs);

    // Evita bloquear el cierre del proceso en entornos Node/tests
    if (this.timer && typeof (this.timer as NodeJS.Timeout).unref === 'function') {
      (this.timer as NodeJS.Timeout).unref();
    }
  }

  /**
   * Detiene el worker en segundo plano.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Consulta el estado actual del job en segundo plano.
   */
  getStatus(): ArlAlertsCronJobStatus {
    return {
      cronExpression: ARL_ALERTS_CRON_EXPRESSION,
      isRunning: this.isExecuting,
      isScheduled: this.timer !== null,
      lastRunAt: this.lastRunAt,
      lastSummary: this.lastSummary,
      nextScheduledDescription: 'Ejecución automática diaria a las 00:00 hrs (RN01)',
    };
  }
}

export const arlAlertsCronWorker = new ArlAlertsCronWorker();
