// Placeholder home page; the hero slice replaces it.
import Link from "next/link";
import { Brand } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-10 pt-6">
      <Brand />
      <section className="flex flex-1 flex-col justify-center gap-5 py-12">
        <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight">
          Drop a TikTok,
          <br />
          <span className="text-primary">get a vote.</span>
        </h1>
        <p className="text-lg text-muted-foreground">
          Share the places you find. Your friends vote. The plan sorts itself out.
        </p>
      </section>
      <Link href="/signin" className={buttonVariants({ size: "lg", block: true })}>
        Get started
      </Link>
    </main>
  );
}
