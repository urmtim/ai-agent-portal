"use client";

import { useActionState, useTransition } from "react";

/**
 * useActionState for modal forms, submitted via onSubmit instead of <form action>,
 * so React does not reset the fields when the server answers with an error.
 */
export function useFormAction<S>(fn: (prev: Awaited<S>, formData: FormData) => Promise<S>, initial: Awaited<S>) {
  const [state, dispatch, pending] = useActionState<S, FormData>(fn, initial);
  const [, start] = useTransition();
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    start(() => dispatch(formData));
  }
  return [state, onSubmit, pending] as const;
}
