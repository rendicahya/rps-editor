// Pengingat tinjauan berkala: RPS yang tanggal penyusunannya sudah lebih dari sekian tahun lalu ditandai
// "perlu ditinjau". Jangka waktunya diingat per browser.
import { todayIso } from './model.js';

const KEY = 'rps-editor.reviewYears';
export const REVIEW_CHOICES = [1, 2, 3, 4, 5];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function load() {
  try {
    const v = Number(localStorage.getItem(KEY));
    if (REVIEW_CHOICES.includes(v)) return v;
  } catch {}
  return 2;
}

export const review = $state({ years: load() });

export function setReviewYears(v) {
  if (!REVIEW_CHOICES.includes(v)) return;
  review.years = v;
  try {
    localStorage.setItem(KEY, String(v));
  } catch {}
}

/** Tanggal acuan tinjauan (ISO) dari identitas RPS: tanggal penyusunan. '' bila tidak ada. */
export function reviewSince(identitas) {
  const d = identitas?.tglPenyusunan ?? '';
  return ISO.test(d) ? d : '';
}

/** Tanggal jatuh tempo tinjauan (ISO) dari tanggal acuan, atau '' bila tidak ada. */
export function reviewDue(since, years = review.years) {
  return since ? `${Number(since.slice(0, 4)) + years}${since.slice(4)}` : '';
}

/** true bila tanggal acuan sudah lewat `years` tahun. */
export const isReviewDue = (since, years = review.years, today = todayIso()) => !!since && reviewDue(since, years) <= today;
