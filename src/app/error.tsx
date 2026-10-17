"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <h1 className="text-title">
        Не получилось загрузить данные
      </h1>
      <p className="text-muted-foreground">
        Скорее всего, не запущена база данных. Запустите Docker Desktop и
        выполните в папке проекта команду{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
          docker compose up -d
        </code>
        , затем попробуйте ещё раз.
      </p>
      <Button onClick={() => retry()} className="mt-3">
        Попробовать ещё раз
      </Button>
    </div>
  );
}
