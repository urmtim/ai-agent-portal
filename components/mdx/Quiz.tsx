"use client";

import { useState } from "react";

type PublicQuestion = { id: string; text: string; options: string[]; multi: boolean };

type Result = {
  score: number;
  total: number;
  passed: boolean;
  correct: Record<string, number[]>; // questionId -> correct option indices
  explanations: Record<string, string>;
};

export function Quiz({
  courseSlug,
  pageSlug,
  quizId,
  questions,
  passThreshold,
}: {
  courseSlug: string;
  pageSlug: string;
  quizId: string;
  questions: PublicQuestion[];
  passThreshold: number;
}) {
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allAnswered = questions.every((q) => (answers[q.id]?.length ?? 0) > 0);

  function toggle(q: PublicQuestion, i: number) {
    if (result) return;
    setAnswers((a) => {
      const cur = a[q.id] ?? [];
      if (q.multi) {
        return { ...a, [q.id]: cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i] };
      }
      return { ...a, [q.id]: [i] };
    });
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseSlug, pageSlug, quizId, answers }),
      });
      if (!res.ok) throw new Error("fail");
      setResult((await res.json()) as Result);
    } catch {
      setError("Не удалось отправить ответы. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  }

  function optClass(q: PublicQuestion, i: number): string {
    const selected = (answers[q.id] ?? []).includes(i);
    if (!result) return selected ? "opt sel" : "opt";
    const correct = result.correct[q.id] ?? [];
    if (correct.includes(i)) return "opt correct";
    if (selected && !correct.includes(i)) return "opt wrong";
    return "opt";
  }

  return (
    <div className="quiz">
      <div className="qh">Проверь себя · {questions.length} вопросов</div>

      {questions.map((q, qi) => (
        <div key={q.id}>
          <div className="q">
            {qi + 1}. {q.text}
            {q.multi && <span className="st mut" style={{ marginLeft: 8 }}>неск. ответов</span>}
          </div>
          {q.options.map((opt, i) => (
            <label key={i} className={optClass(q, i)}>
              <input
                type={q.multi ? "checkbox" : "radio"}
                name={`${quizId}-${q.id}`}
                checked={(answers[q.id] ?? []).includes(i)}
                disabled={!!result}
                onChange={() => toggle(q, i)}
              />
              <span>{opt}</span>
            </label>
          ))}
          {result && result.explanations[q.id] && (
            <div className="callout info" style={{ margin: "10px 0 4px" }}>
              <span className="ic">💡</span>
              <div style={{ fontSize: 13.5 }}>{result.explanations[q.id]}</div>
            </div>
          )}
        </div>
      ))}

      {error && (
        <div className="formerr" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}

      {!result ? (
        <button
          className="btn primary"
          style={{ marginTop: 14 }}
          disabled={!allAnswered || submitting}
          onClick={submit}
        >
          {submitting ? "Проверяем…" : "Проверить"}
        </button>
      ) : (
        <div className="result" style={{ marginTop: 16 }}>
          <span className={`st ${result.passed ? "ok" : "err"}`}>
            {result.passed ? "Зачёт" : "Не сдано"}
          </span>{" "}
          — {result.score} из {result.total} правильно (
          {Math.round((result.score / result.total) * 100)}%, порог {passThreshold}%)
          <button
            className="btn ghost sm"
            style={{ marginLeft: 12 }}
            onClick={() => {
              setResult(null);
              setAnswers({});
            }}
          >
            Пройти заново
          </button>
        </div>
      )}
    </div>
  );
}
