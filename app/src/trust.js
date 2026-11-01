// Индекс доверия 0–100. Формула открыта (описана на странице /docs#trust), чтобы создатели понимали,
// как его поднять честно. Компоненты сглаживаются байесовски: у нового агента с одной удачной задачей
// не будет «100% успеха».

import { agentStats } from './stats.js';
import { reviewSummary } from './reviews.js';
import { validExam } from './exam.js';

export const WEIGHTS = { success: 30, exam: 20, safety: 10, rating: 15, stability: 15, repeat: 10 };
/** Если была проверка по существу, компонент «Экзамен» = 40% надёжность + 60% качество ответов. */
export const EXAM_MIX = { reliability: 0.4, substance: 0.6 };

export function examQuality(exam) {
  if (!exam) return 0;
  if (exam.substance_score == null) return exam.quality_score;
  return EXAM_MIX.reliability * exam.quality_score + EXAM_MIX.substance * exam.substance_score;
}
export const MIN_TASKS = 5;
export const MIN_BUYERS = 3;

/** Байесовское сглаживание: как будто у агента уже было weight наблюдений со средним prior. */
const smooth = (hits, n, prior, weight) => (hits + prior * weight) / (n + weight);

/** 1 при медиане до 2 с, линейно до 0,5 при 20 с и дольше. */
export function latencyFactor(ms) {
  if (ms == null) return 0.5;
  if (ms <= 2000) return 1;
  if (ms >= 20_000) return 0.5;
  return 1 - 0.5 * ((ms - 2000) / 18_000);
}

export function levelOf(index) {
  if (index == null) return null;
  if (index >= 85) return 'high';
  if (index >= 70) return 'good';
  if (index >= 50) return 'medium';
  return 'low';
}

export function computeTrust({ stats, reviews, exam }) {
  const n = stats.counted;
  const components = {
    success: smooth(stats.ok, n, 0.5, 5),
    exam: examQuality(exam),
    safety: exam ? exam.safety_score : 0,
    // Средняя оценка с «виртуальными» 3 отзывами на 3,5 звезды, затем в шкалу 0–1
    rating: (smooth(reviews.sum, reviews.count, 3.5, 3) - 1) / 4,
    stability: smooth(stats.responded, n, 0.5, 5) * latencyFactor(stats.medianLatency),
    repeat: smooth(stats.repeatCount, stats.buyers, 0.2, 3),
  };
  let sum = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) sum += w * components[k];
  return { raw: Math.round(sum), components };
}

/** Полный паспорт агента: метрики, отзывы, экзамен и индекс (если данных достаточно). */
export function trustPassport(db, agent, now = Date.now()) {
  const stats = agentStats(db, agent.id, now);
  const reviews = reviewSummary(db, agent.id);
  const { exam, state: examState } = validExam(db, agent, now);
  const usableExam = examState === 'valid' ? exam : null;
  const { raw, components } = computeTrust({ stats, reviews, exam: usableExam });
  const eligible = stats.counted >= MIN_TASKS && stats.buyers >= MIN_BUYERS;
  const index = eligible ? raw : null;
  return {
    index,
    level: levelOf(index),
    eligible,
    requirements: { minTasks: MIN_TASKS, minBuyers: MIN_BUYERS },
    components: Object.fromEntries(Object.entries(components).map(([k, v]) => [k, Math.round(v * 100) / 100])),
    weights: WEIGHTS,
    stats,
    reviews: { count: reviews.count, average: reviews.average == null ? null : Math.round(reviews.average * 10) / 10 },
    exam: exam ? {
      state: examState,
      quality: exam.quality_score,
      safety: exam.safety_score,
      substance: exam.substance_score ?? null,
      substance_status: exam.substance_status || 'off',
      judge_model: exam.judge_model || null,
      finished_at: exam.finished_at,
      passed: exam.results.filter((r) => r.pass).map((r) => r.id),
      failed: exam.results.filter((r) => !r.pass).map((r) => r.id),
    } : { state: 'none' },
  };
}
