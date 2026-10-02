import Link from "next/link";
import {
  CalendarDays,
  EyeOff,
  Gift,
  Layers,
  Link2,
  MapPinned,
  MessageSquareText,
  Receipt,
  ShieldCheck,
  Sparkles,
  Vote,
} from "lucide-react";
import { APP_NAME } from "@wandr/core/config";
import { Brand } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";
import { routes } from "@/lib/routes";
import { ProductPreview } from "./product-preview";
import { ClassicSetupForm, PasteStartForm } from "./start-forms";

/**
 * Public landing page. Desktop visitors are usually starting to plan, so the classic setup form
 * is the hero CTA; on phones the paste box comes first (capture-first). Claims are product
 * facts from REQUIREMENTS.md only: no invented testimonials, ratings or usage numbers.
 */
export function Landing() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      {/* Hero */}
      <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 pb-16 pt-8 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:px-8 lg:pb-24 lg:pt-16">
        <div className="space-y-6">
          <p className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
            <Sparkles className="size-3.5" aria-hidden /> Group trip planning, minus the group-chat chaos
          </p>
          <h1 className="font-display text-5xl font-extrabold leading-[1.02] tracking-tight lg:text-7xl">
            The group chat that <span className="text-primary">actually decides.</span>
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground lg:text-xl">
            Drop the TikToks. Vote by text. Split the bill. {APP_NAME} turns every link your friends share into a
            real place, gets everyone&apos;s vote, and keeps the plan and the money straight.
          </p>
          {/* Phones: paste-first */}
          <div className="lg:hidden">
            <PasteStartForm />
            <a href="#start" className="mt-3 inline-block text-sm font-semibold text-primary">
              Or set up a trip by destination →
            </a>
          </div>
          <ul className="hidden gap-x-6 gap-y-2 text-sm font-medium text-muted-foreground lg:flex lg:flex-wrap">
            <li>✓ Friends join by text, no app</li>
            <li>✓ Private votes, no peer pressure</li>
            <li>✓ Splits in any currency</li>
          </ul>
        </div>
        <div className="hidden lg:block">
          <div className="rounded-3xl border bg-card p-6 shadow-xl" id="start-desktop">
            <h2 className="mb-1 font-display text-2xl font-bold">Plan your next trip</h2>
            <p className="mb-5 text-sm text-muted-foreground">Takes a minute. Add friends when you&apos;re ready.</p>
            <ClassicSetupForm />
            <div className="my-5 flex items-center gap-3 text-xs font-semibold text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
            </div>
            <PasteStartForm label="Start from a TikTok, Reel or link" />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y bg-card/60 py-16 lg:py-24">
        <div className="mx-auto w-full max-w-6xl px-5 lg:px-8">
          <SectionTitle eyebrow="How it works" title="From “we should go!” to a plan everyone's in on" />
          <ol className="mt-10 grid gap-6 lg:grid-cols-3">
            <Step
              n={1}
              icon={<Link2 aria-hidden />}
              title="Drop links in one place"
              body="Paste TikToks, Reels, Maps links or screenshots, or text them to the trip. AI finds the real place, hours and price, and files it under the right city."
            />
            <Step
              n={2}
              icon={<Vote aria-hidden />}
              title="Everyone votes, even without the app"
              body="Each friend gets a personal text and votes Must-do, Down or Pass in two taps. Votes stay blind until you vote, so the loudest voice doesn't win."
            />
            <Step
              n={3}
              icon={<CalendarDays aria-hidden />}
              title="Lock it in, then go"
              body="Organizers decide in stages: where, when, stay, getting around, what to do. Arrange the days in one tap, snap receipts, and settle up."
            />
          </ol>
          <div className="mt-10 text-center">
            <CtaLink />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-16 lg:py-24">
        <div className="mx-auto w-full max-w-6xl px-5 lg:px-8">
          <SectionTitle eyebrow="Everything a trip needs" title="Simple first. Powerful when you need it." />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Feature icon={<Sparkles />} title="AI-resolved idea cards" body="Every link becomes a card with the place, a pin and a summary. Wrong place? Fix it in a tap." />
            <Feature icon={<EyeOff />} title="Blind voting" body="No one sees the tally until they vote. Pass votes are never shown by name." />
            <Feature icon={<MapPinned />} title="Multi-city trips" body="Lisbon then Porto? Ideas file under the right stop, and people can join just part of the trip." />
            <Feature icon={<CalendarDays />} title="Arrange my days" body="Turns decided ideas into a day-by-day plan around opening hours, meals and travel time. You preview before anything changes." />
            <Feature icon={<Receipt />} title="Receipts, split right" body="Snap a receipt and split it evenly or item by item. Balances are kept per currency, to the cent." />
            <Feature icon={<MessageSquareText />} title="Works by text" body="Friends vote and get reminders by text, kept to about one a day. Reply STOP any time." />
          </div>
        </div>
      </section>

      {/* Trip types */}
      <section id="trips" className="border-y bg-card/60 py-16 lg:py-24">
        <div className="mx-auto w-full max-w-6xl px-5 lg:px-8">
          <SectionTitle eyebrow="For every kind of trip" title="Two of you, ten of you, or just you" />
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            <UseCase
              icon={<Layers />}
              title="Friend trips"
              body="Everyone drops ideas, the app ranks them by who's in, and organizers make the call. Nobody has to be the bad guy."
            />
            <UseCase
              icon={<Gift />}
              title="Bachelor & bachelorette"
              body="Surprise mode hides plans from the guest of honor, and their share is covered by the group in one tap."
            />
            <UseCase
              icon={<Vote />}
              title="Duos & solo"
              body="Two of you? See where you agree at a glance. Going alone? Your saves become a ranked, mapped plan."
            />
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="py-16 lg:py-20">
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-5 lg:grid-cols-3 lg:px-8">
          <Trust title="Private by design" body="Phone numbers are never shown to other members. Individual Pass votes stay private." />
          <Trust title="Rankings can't be bought" body="Nothing paid ever changes a vote, a ranking or a suggestion." />
          <Trust title="Joining is always free" body="Friends never pay to join a trip, vote or split costs." />
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t bg-card/60 py-16 lg:py-24">
        <div className="mx-auto w-full max-w-3xl px-5 lg:px-8">
          <SectionTitle eyebrow="FAQ" title="Good questions" />
          <div className="mt-8 divide-y rounded-2xl border bg-card">
            <Faq q="Do my friends need to download an app?" a="No. Everyone gets a personal link by text and can view and vote right away in their browser." />
            <Faq q="Do I need an account to start?" a="No. Start a trip with just a name or a link. You confirm your number when you invite people." />
            <Faq q="Where does it work?" a="Anywhere you travel. Text messages go to US and Canadian numbers for now; friends elsewhere can use email." />
            <Faq q="How does it handle money?" a="It tracks who paid and who owes, per currency, and shows the fewest payments to settle up. It never moves money itself." />
            <Faq q="Is it free?" a="Yes, planning a trip with friends is free. Joining a trip, voting and splitting costs are always free." />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section id="start" className="py-16 lg:py-24">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 lg:grid-cols-2 lg:px-8">
          <div className="space-y-4">
            <h2 className="font-display text-4xl font-extrabold leading-tight tracking-tight lg:text-5xl">
              Your next trip starts with one link.
            </h2>
            <p className="text-lg text-muted-foreground">
              Set it up now. Invite friends when you&apos;re ready. They vote from a text.
            </p>
          </div>
          <div className="space-y-6 rounded-3xl border bg-card p-6 shadow-xl">
            <ClassicSetupForm cta="Start my trip" />
            <div className="hidden lg:block lg:pt-2">
              <ProductPreviewNote />
            </div>
          </div>
        </div>
        <div className="mx-auto mt-16 hidden w-full max-w-6xl px-8 lg:block">
          <ProductPreview />
        </div>
      </section>

      <footer className="border-t py-8 text-sm text-muted-foreground">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-5 lg:px-8">
          <Brand className="text-base [&_svg]:size-6" />
          <nav className="flex gap-5">
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#faq">FAQ</a>
            <Link href={routes.signin()}>Sign in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-transparent bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 lg:px-8">
        <Brand />
        <nav aria-label="Site" className="hidden items-center gap-7 text-sm font-semibold text-muted-foreground lg:flex">
          <a href="#how" className="hover:text-foreground">How it works</a>
          <a href="#features" className="hover:text-foreground">Features</a>
          <a href="#trips" className="hover:text-foreground">Bach parties</a>
          <a href="#faq" className="hover:text-foreground">FAQ</a>
        </nav>
        <div className="flex items-center gap-3">
          <Link href={routes.signin()} className="text-sm font-semibold text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
          <CtaLink size="sm" className="hidden sm:inline-flex" />
        </div>
      </div>
    </header>
  );
}

function CtaLink({ size = "lg", className }: { size?: "sm" | "lg"; className?: string }) {
  return (
    <a href="#start" className={buttonVariants({ size, className })}>
      Start a trip, free
    </a>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-bold uppercase tracking-wider text-primary">{eyebrow}</p>
      <h2 className="mt-2 font-display text-3xl font-extrabold leading-tight tracking-tight lg:text-4xl">{title}</h2>
    </div>
  );
}

function Step({ n, icon, title, body }: { n: number; icon: React.ReactNode; title: string; body: string }) {
  return (
    <li className="rounded-2xl border bg-background p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground [&_svg]:size-5">
          {icon}
        </span>
        <span className="text-sm font-bold text-muted-foreground">Step {n}</span>
      </div>
      <h3 className="font-display text-xl font-bold">{title}</h3>
      <p className="mt-2 text-muted-foreground">{body}</p>
    </li>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border bg-card p-6">
      <span className="mb-3 inline-grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground [&_svg]:size-5">
        {icon}
      </span>
      <h3 className="font-display text-lg font-bold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function UseCase({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border bg-background p-6">
      <span className="mb-3 inline-grid size-10 place-items-center rounded-xl bg-secondary text-secondary-foreground [&_svg]:size-5">
        {icon}
      </span>
      <h3 className="font-display text-xl font-bold">{title}</h3>
      <p className="mt-2 text-muted-foreground">{body}</p>
      <a href="#start" className="mt-4 inline-block text-sm font-semibold text-primary">
        Start one →
      </a>
    </div>
  );
}

function Trust({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex gap-3">
      <ShieldCheck className="mt-0.5 size-6 shrink-0 text-secondary-foreground" aria-hidden />
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="group p-5">
      <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
        {q}
        <span aria-hidden className="text-muted-foreground transition group-open:rotate-45">
          +
        </span>
      </summary>
      <p className="mt-2 text-muted-foreground">{a}</p>
    </details>
  );
}

function ProductPreviewNote() {
  return (
    <p className="text-center text-xs text-muted-foreground">
      Prefer to start from something you found? <a href="#start-desktop" className="font-semibold text-primary">Paste a link instead</a>.
    </p>
  );
}
