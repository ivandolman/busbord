import { Suspense } from "react";
import { BoardApp } from "@/components/BoardApp";

export default function Page() {
  return (
    <main>
      <h1 className="sr-only">Bestemmingsbord: alle bussen en trams naar je bestemming</h1>
      <Suspense>
        <BoardApp />
      </Suspense>
    </main>
  );
}
