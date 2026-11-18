import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, BookOpen, Check, ChevronDown, Flame, Headphones,
  History, Leaf, LockKeyhole, Moon, Search, Settings2, Sparkles, Sun, Volume2, X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  buildDailyQuiz, getLocalDateKey, getScheduleAccess, getWordsForDate,
  vocabulary, type QuizQuestion, type VocabularyWord,
} from "@/lib/vocabulary";
import { registerVocabularyPwa } from "@/lib/register-pwa";
import deskImage from "@/assets/vocabulary-desk.jpg";

const storageKey = "word-by-word:progress:v1";
const navigation = [
  { id: "study", label: "Today's words", icon: BookOpen },
  { id: "quiz", label: "Night review", icon: Moon },
  { id: "archive", label: "Word archive", icon: History },
] as const;

type Page = (typeof navigation)[number]["id"];
type DailyAttempt = { id: string; date: string; score: number; total: number; wordIds: string[] };
type ProgressStore = { previewMode: boolean; learnedIds: string[]; attempts: DailyAttempt[] };
type QuizAnswer = { selected: string; correct: boolean };
const emptyStore: ProgressStore = { previewMode: false, learnedIds: [], attempts: [] };

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Word by Word — Daily English Vocabulary" },
      { name: "description", content: "Learn two useful English words each day, then revisit them in a thoughtful evening quiz." },
      { property: "og:title", content: "Word by Word — Daily English Vocabulary" },
      { property: "og:description", content: "Two useful English words, one easy-to-keep daily habit." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VocabularyHome,
});

function getStoredProgress(): ProgressStore {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return emptyStore;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object") return emptyStore;
    const value = parsed as Partial<ProgressStore>;
    return {
      previewMode: value.previewMode === true,
      learnedIds: Array.isArray(value.learnedIds) ? value.learnedIds.filter((id): id is string => typeof id === "string") : [],
      attempts: Array.isArray(value.attempts) ? value.attempts.filter(isDailyAttempt) : [],
    };
  } catch {
    return emptyStore;
  }
}

function isDailyAttempt(value: unknown): value is DailyAttempt {
  if (!value || typeof value !== "object") return false;
  const attempt = value as Partial<DailyAttempt>;
  return typeof attempt.id === "string" && typeof attempt.date === "string" &&
    typeof attempt.score === "number" && typeof attempt.total === "number" &&
    Array.isArray(attempt.wordIds) && attempt.wordIds.every((id) => typeof id === "string");
}

function calculateStreak(attempts: DailyAttempt[], today: string) {
  const uniqueDates = [...new Set(attempts.map((attempt) => attempt.date))].sort((a, b) => b.localeCompare(a));
  const latest = uniqueDates[0];
  if (!latest) return 0;
  const dateGap = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${latest}T00:00:00Z`)) / 86_400_000);
  if (dateGap > 1 || dateGap < 0) return 0;
  let streak = 1;
  let expected = Date.parse(`${latest}T00:00:00Z`);
  for (const next of uniqueDates.slice(1)) {
    expected -= 86_400_000;
    if (Date.parse(`${next}T00:00:00Z`) !== expected) break;
    streak += 1;
  }
  return streak;
}

function VocabularyHome() {
  const [progress, setProgress] = useState<ProgressStore>(emptyStore);
  const [hydrated, setHydrated] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [activePage, setActivePage] = useState<Page>("study");
  const [activeSlot, setActiveSlot] = useState<"morning" | "evening">("morning");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedSentences, setExpandedSentences] = useState<string[]>([]);
  const [quizStarted, setQuizStarted] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [quizComplete, setQuizComplete] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);

  useEffect(() => {
    setProgress(getStoredProgress());
    setHydrated(true);
    setNow(new Date());
    const updateClock = () => setNow(new Date());
    const timer = window.setInterval(updateClock, 30_000);
    void registerVocabularyPwa().catch(() => undefined);
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(storageKey, JSON.stringify(progress)); } catch { /* Storage can be full or disabled. */ }
  }, [hydrated, progress]);

  const todayKey = now ? getLocalDateKey(now) : "";
  const todayWords = useMemo(() => todayKey ? getWordsForDate(todayKey) : null, [todayKey]);
  const schedule = now ? getScheduleAccess(now, progress.previewMode) : { morning: false, evening: false, quiz: false };
  const quizQuestions = useMemo(() => todayWords ? buildDailyQuiz(todayWords) : [], [todayWords]);
  const todayAttempts = progress.attempts.filter((attempt) => attempt.date === todayKey);
  const streak = todayKey ? calculateStreak(progress.attempts, todayKey) : 0;
  const currentQuestion = quizQuestions[questionIndex];
  const isNight = activePage === "quiz";
  const timeLabel = now ? new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(now) : "Your daily practice";
  const displayMode = isNight ? "night" : activeSlot === "evening" && activePage === "study" ? "evening" : "morning";
  const filteredLearned = vocabulary.filter((word) =>
    progress.learnedIds.includes(word.id) && `${word.word} ${word.meaning} ${word.synonyms.join(" ")}`.toLowerCase().includes(searchTerm.trim().toLowerCase()),
  );

  function setLearned(wordId: string) {
    setProgress((current) => ({
      ...current,
      learnedIds: current.learnedIds.includes(wordId)
        ? current.learnedIds.filter((id) => id !== wordId)
        : [...current.learnedIds, wordId],
    }));
  }

  function startQuiz() {
    setQuestionIndex(0);
    setAnswers([]);
    setSelectedChoice(null);
    setQuizComplete(false);
    setQuizStarted(true);
  }

  function submitAnswer() {
    if (!currentQuestion || !selectedChoice) return;
    setAnswers((current) => [...current, { selected: selectedChoice, correct: selectedChoice === currentQuestion.answer }]);
    setSelectedChoice(`__checked__${selectedChoice}`);
  }

  function continueQuiz() {
    if (questionIndex + 1 < quizQuestions.length) {
      setQuestionIndex((current) => current + 1);
      setSelectedChoice(null);
      return;
    }
    const latestAnswers = answers;
    const score = latestAnswers.filter((answer) => answer.correct).length;
    if (todayWords && todayKey) {
      setProgress((current) => ({
        ...current,
        learnedIds: [...new Set([...current.learnedIds, ...todayWords.map((word) => word.id)])],
        attempts: [...current.attempts, {
          id: `${todayKey}-${Date.now()}`,
          date: todayKey,
          score,
          total: quizQuestions.length,
          wordIds: todayWords.map((word) => word.id),
        }],
      }));
    }
    setQuizComplete(true);
  }

  function speak(word: string) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "en-US";
    utterance.rate = 0.85;
    window.speechSynthesis.speak(utterance);
  }

  async function promptInstall() {
    if (!installPrompt) return;
    const promptEvent = installPrompt as Event & { prompt?: () => Promise<void>; userChoice?: Promise<{ outcome: string }> };
    await promptEvent.prompt?.();
    const choice = await promptEvent.userChoice;
    if (choice?.outcome === "accepted") setInstallPrompt(null);
  }

  return (
    <div className="app-shell min-h-screen" data-mode={displayMode}>
      <header className="border-b border-border/70">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between px-4 py-3 sm:px-7">
          <button className="flex items-center gap-3 text-left" onClick={() => { setActivePage("study"); setActiveSlot("morning"); }} aria-label="Word by Word home">
            <span className="grid size-10 place-items-center rounded-sm bg-primary text-primary-foreground"><BookOpen className="size-5" /></span>
            <span><span className="block font-display text-lg font-semibold leading-5">Word by Word</span><span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">A daily vocabulary ritual</span></span>
          </button>
          <div className="flex items-center gap-2">
            {streak > 0 && <span className="hidden items-center gap-1.5 border-r border-border px-3 text-sm font-semibold sm:inline-flex" title="Daily quiz streak"><Flame className="size-4 text-editorial" />{streak} day{streak === 1 ? "" : "s"}</span>}
            {installPrompt && <Button variant="outline" size="sm" onClick={promptInstall} className="hidden sm:inline-flex">Install app</Button>}
            <Button variant="ghost" size="icon" aria-label="Open settings" title="Settings" onClick={() => setSettingsOpen(true)}><Settings2 className="size-5" /></Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl items-start gap-8 px-4 pb-12 pt-6 sm:px-7 sm:pt-9 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-12">
        <aside className="lg:sticky lg:top-6">
          <nav className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0" aria-label="Main navigation">
            {navigation.map(({ id, label, icon: Icon }) => (
              <Button key={id} variant={activePage === id ? "secondary" : "ghost"} className="h-10 shrink-0 justify-start gap-3 px-3 lg:w-full" aria-current={activePage === id ? "page" : undefined} onClick={() => setActivePage(id)}>
                <Icon className="size-4" />{label}{id === "quiz" && schedule.quiz && <span className="ml-auto size-1.5 rounded-full bg-editorial" />}
              </Button>
            ))}
          </nav>
          <div className="mt-5 hidden border-t border-border pt-5 lg:block">
            <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Words learned</span><span className="font-semibold text-foreground">{progress.learnedIds.length} / {vocabulary.length}</span></div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary" aria-label={`${progress.learnedIds.length} of ${vocabulary.length} words learned`}><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(progress.learnedIds.length / vocabulary.length * 100, 100)}%` }} /></div>
            <div className="mt-5 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><Leaf className="mt-0.5 size-4 shrink-0 text-primary" />Small steps, kept every day.</div>
          </div>
        </aside>

        <main className="min-w-0" key={activePage}>
          {activePage === "study" && (
            <section>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{timeLabel}</p><h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">A little language, daily.</h1><p className="mt-2 text-sm text-muted-foreground">Two practical words. A clearer way to say what you mean.</p></div>
                <div className="flex items-center gap-3 pb-1 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Sun className="size-4 text-primary" />6:00 AM</span><span className="h-4 w-px bg-border" /><span className="inline-flex items-center gap-1.5"><Moon className="size-4 text-editorial" />5:00 PM</span></div>
              </div>

              <div className="relative mt-6 h-36 overflow-hidden rounded-sm sm:h-44">
                <img src={deskImage} alt="A quiet writing desk in morning light" className="absolute inset-0 size-full object-cover object-center" width={1200} height={720} fetchPriority="high" />
                <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/65 to-transparent" />
                <div className="absolute inset-y-0 left-0 flex max-w-xs flex-col justify-center px-5 sm:px-8"><span className="text-[10px] font-semibold uppercase tracking-wider text-primary">Your daily practice</span><p className="mt-2 max-w-60 font-display text-xl font-semibold leading-snug sm:text-2xl">Words that stay with you.</p></div>
                <span className="absolute bottom-3 right-4 flex items-center gap-1.5 text-xs font-medium text-foreground/80"><Sparkles className="size-3.5" />{vocabulary.length} useful words to explore</span>
              </div>

              <div className="mt-6 flex gap-2 border-b border-border" role="tablist" aria-label="Today's word">
                {(["morning", "evening"] as const).map((slot, index) => {
                  const accessible = slot === "morning" ? schedule.morning : schedule.evening;
                  const selected = activeSlot === slot;
                  return <button key={slot} type="button" role="tab" aria-selected={selected} className={`relative flex min-w-0 items-center gap-2 px-3 py-3 text-sm font-medium transition-colors sm:px-4 ${selected ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`} onClick={() => setActiveSlot(slot)}>
                    {slot === "morning" ? <Sun className="size-4" /> : <Moon className="size-4" />}<span>{slot === "morning" ? "Morning word" : "Evening word"}</span><span className="hidden text-xs text-muted-foreground sm:inline">{slot === "morning" ? "6:00 AM" : "5:00 PM"}</span>{!accessible && <LockKeyhole className="size-3" />}{selected && <span className="absolute inset-x-3 bottom-[-1px] h-0.5 bg-primary sm:inset-x-4" />}
                  </button>;
                })}
              </div>
              <div className="pt-5">
                {!hydrated || !todayWords ? <div className="animate-pulse py-10 text-sm text-muted-foreground">Finding today's words…</div> : !(activeSlot === "morning" ? schedule.morning : schedule.evening) ? <LockedWord time={activeSlot === "morning" ? "6:00 AM" : "5:00 PM"} /> : <WordCard word={todayWords[activeSlot === "morning" ? 0 : 1]} slot={activeSlot} learned={progress.learnedIds.includes(todayWords[activeSlot === "morning" ? 0 : 1].id)} expanded={expandedSentences.includes(todayWords[activeSlot === "morning" ? 0 : 1].id)} onSpeak={speak} onLearn={() => setLearned(todayWords[activeSlot === "morning" ? 0 : 1].id)} onExpand={() => setExpandedSentences((current) => current.includes(todayWords[activeSlot === "morning" ? 0 : 1].id) ? current.filter((id) => id !== todayWords[activeSlot === "morning" ? 0 : 1].id) : [...current, todayWords[activeSlot === "morning" ? 0 : 1].id])} />}
              </div>

              <section className="mt-8 border-t border-border pt-6">
                <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">After 8:30 PM</p><h2 className="mt-1 font-display text-xl font-semibold">A gentle evening review</h2><p className="mt-1.5 max-w-md text-sm text-muted-foreground">Revisit today's two words with a short quiz that helps them stick.</p></div><Moon className="mt-2 size-5 shrink-0 text-editorial" /></div>
                <Button className="mt-4" onClick={() => { setActivePage("quiz"); }} disabled={!schedule.quiz}>{schedule.quiz ? <>Begin today's quiz <ArrowRight /></> : <>Available at 8:30 PM <LockKeyhole /></>}</Button>
                {todayAttempts.length > 0 && <span className="ml-3 text-xs text-muted-foreground">{todayAttempts[todayAttempts.length - 1]?.score}/{todayAttempts[todayAttempts.length - 1]?.total} last score</span>}
              </section>
            </section>
          )}

          {activePage === "quiz" && (
            <section className="quiz-page">
              {!schedule.quiz && <div className="mb-5 flex items-center gap-3 border border-night-line bg-night-panel p-4 text-sm text-night-ink"><LockKeyhole className="size-4 shrink-0 text-editorial" /><span>Tonight's quiz opens at 8:30 PM.</span><Button variant="outline" size="sm" className="ml-auto shrink-0" onClick={() => setSettingsOpen(true)}>Preview settings</Button></div>}
              {!quizStarted ? <QuizIntro count={todayWords ? todayWords.length : 2} attempts={todayAttempts} onStart={startQuiz} disabled={!schedule.quiz || !todayWords} /> : quizComplete ? <QuizResults score={answers.filter((answer) => answer.correct).length} questions={quizQuestions} answers={answers} onRestart={startQuiz} onArchive={() => setActivePage("archive")} /> : currentQuestion ? <QuizQuestionView question={currentQuestion} index={questionIndex} total={quizQuestions.length} selected={selectedChoice} checked={selectedChoice?.startsWith("__checked__") === true} answer={answers.at(-1)} onSelect={setSelectedChoice} onCheck={submitAnswer} onContinue={continueQuiz} onLeave={() => setActivePage("study")} /> : null}
            </section>
          )}

          {activePage === "archive" && (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your growing collection</p><h1 className="mt-2 font-display text-3xl font-semibold">Words to keep.</h1><p className="mt-2 text-sm text-muted-foreground">Words you learned are collected here, ready whenever you are.</p>
              <div className="relative mt-6 max-w-lg"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search learned words" placeholder="Search words or meanings" className="pl-9" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} /></div>
              <div className="mt-6 space-y-0 divide-y divide-border border-y border-border">
                {filteredLearned.length === 0 ? <div className="py-12 text-center"><BookOpen className="mx-auto size-6 text-muted-foreground" /><p className="mt-3 text-sm font-medium">{progress.learnedIds.length ? "No words found" : "Your first learned word starts today."}</p><p className="mt-1 text-xs text-muted-foreground">{progress.learnedIds.length ? "Try a different search." : "Mark a word as learned after studying it or completing a quiz."}</p><Button variant="outline" size="sm" className="mt-4" onClick={() => setActivePage("study")}>Back to today's words</Button></div> : filteredLearned.map((word) => <ArchiveEntry key={word.id} word={word} onRemove={() => setLearned(word.id)} onSpeak={speak} />)}
              </div>
              <section className="mt-8 border-t border-border pt-6"><div className="flex items-center gap-2"><History className="size-4 text-muted-foreground" /><h2 className="font-display text-lg font-semibold">Past quizzes</h2></div>{progress.attempts.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Completed reviews and scores will appear here.</p> : <ul className="mt-3 space-y-2">{[...progress.attempts].reverse().map((attempt) => <li key={attempt.id} className="flex items-center justify-between border-b border-border/70 py-3 text-sm"><span>{new Date(`${attempt.date}T12:00:00`).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })}</span><span className="font-medium">{attempt.score} / {attempt.total}</span></li>)}</ul>}</section>
            </section>
          )}
        </main>
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-display text-2xl">Your study settings</DialogTitle><DialogDescription>Make your daily practice fit your schedule.</DialogDescription></DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="flex items-center justify-between gap-5"><div><Label htmlFor="preview-mode" className="text-sm font-semibold">Unlock all words and quizzes</Label><p className="mt-1 text-xs leading-5 text-muted-foreground">Preview the evening word and quiz at any time.</p></div><Switch id="preview-mode" checked={progress.previewMode} onCheckedChange={(enabled) => setProgress((current) => ({ ...current, previewMode: enabled }))} aria-label="Unlock all words and quizzes" /></div>
            <div className="border-t border-border pt-4"><p className="text-sm font-semibold">Daily study times</p><div className="mt-2 flex gap-4 text-xs text-muted-foreground"><span>Morning · 6:00 AM</span><span>Evening · 5:00 PM</span><span>Quiz · 8:30 PM</span></div></div>
            {installPrompt && <Button className="w-full" onClick={promptInstall}><BookOpen /> Add to your home screen</Button>}
          </div>
        </DialogContent>
      </Dialog>

      {installPrompt && <button className="fixed bottom-4 right-4 z-30 grid size-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg sm:hidden" title="Install app" aria-label="Install app" onClick={promptInstall}><BookOpen className="size-5" /></button>}
    </div>
  );
}

function LockedWord({ time }: { time: string }) {
  return <div className="flex min-h-36 items-center gap-4 border-y border-border py-6 text-muted-foreground"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary"><LockKeyhole className="size-4" /></span><div><p className="font-medium text-foreground">A new word is on its way.</p><p className="mt-1 text-sm">Come back at {time}, or turn on preview mode in settings.</p></div></div>;
}

function WordCard({ word, slot, learned, expanded, onSpeak, onLearn, onExpand }: {
  word: VocabularyWord;
  slot: "morning" | "evening";
  learned: boolean;
  expanded: boolean;
  onSpeak: (word: string) => void;
  onLearn: () => void;
  onExpand: () => void;
}) {
  return <article className="word-arrive" aria-label={`${slot} vocabulary word`}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><span>{slot === "morning" ? "Your morning word" : "Your evening word"}</span><span className="size-1 rounded-full bg-editorial" aria-hidden="true" /><span>{word.partOfSpeech}</span></div><div className="mt-2 flex flex-wrap items-center gap-3"><h2 className="font-display text-5xl font-semibold leading-[1.1] sm:text-6xl">{word.word}</h2><Button variant="ghost" size="icon" title={`Hear ${word.word} pronounced`} aria-label={`Hear ${word.word} pronounced`} onClick={() => onSpeak(word.word)}><Volume2 className="size-5" /></Button></div><p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><span>{word.phonetic}</span><span aria-hidden="true">·</span><span>English pronunciation</span></p></div>
      <Button variant={learned ? "secondary" : "outline"} size="sm" className="shrink-0" onClick={onLearn}>{learned ? <><Check /> Learned</> : <><BookOpen /> Mark learned</>}</Button>
    </div>

    <p className="mt-5 max-w-2xl text-[15px] leading-7 text-foreground sm:text-base">{word.meaning}</p>
    <div className="mt-5 flex flex-wrap gap-x-7 gap-y-3 border-y border-border py-4 text-sm"><WordRelation label="Similar" terms={word.synonyms} /><WordRelation label="Opposite" terms={word.antonyms} /></div>

    <div className="mt-5"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">In a sentence</p><blockquote className="mt-2 max-w-2xl border-l-2 border-editorial pl-4 text-sm leading-6 text-foreground">“{word.examples[0]}”</blockquote>
      <Button variant="ghost" size="sm" className="mt-2 -ml-2 text-primary" aria-expanded={expanded} onClick={onExpand}>{expanded ? <>Fewer examples <ChevronDown className="rotate-180" /></> : <>Show more sentences <ArrowRight /></>}</Button>
      {expanded && <div className="mt-3 space-y-3 border-t border-border pt-4 word-arrive">{word.examples.slice(1).map((example, index) => <div key={example} className="grid gap-1 sm:grid-cols-[100px_1fr]"><span className="pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{["Everyday", "At work", "In writing"][index]}</span><p className="text-sm leading-6 text-foreground">“{example}”</p></div>)}</div>}
    </div>
    <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground"><Headphones className="size-3.5" />Listen and say it aloud to help it stick.</div>
  </article>;
}

function WordRelation({ label, terms }: { label: string; terms: [string, string] }) {
  return <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="text-xs text-muted-foreground">{label}</span>{terms.map((term, index) => <span className="font-medium" key={term}>{term}{index === 0 && <span className="ml-2 font-normal text-border" aria-hidden="true">/</span>}</span>)}</div>;
}

function QuizIntro({ count, attempts, onStart, disabled }: { count: number; attempts: DailyAttempt[]; onStart: () => void; disabled: boolean }) {
  return <div className="quiz-intro-panel">
    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-night-muted"><Moon className="size-4" />A moment to remember</p>
    <h1 className="mt-3 font-display text-4xl font-semibold leading-tight text-night-ink sm:text-5xl">Let today’s words settle in.</h1>
    <p className="mt-3 max-w-lg text-sm leading-6 text-night-muted">A calm, eight-question check-in on the words you met today. Take your time.</p>
    <div className="mt-7 flex flex-wrap gap-x-7 gap-y-3 border-y border-night-line py-4 text-sm text-night-muted"><span><strong className="text-night-ink">{count}</strong> words to revisit</span><span><strong className="text-night-ink">8</strong> gentle questions</span><span><strong className="text-night-ink">No timer</strong></span></div>
    <Button className="mt-6" onClick={onStart} disabled={disabled}>Begin evening review <ArrowRight /></Button>
    {disabled && <p className="mt-3 text-xs text-night-muted">The review opens at 8:30 PM. You can unlock it in settings.</p>}
    {attempts.length > 0 && <p className="mt-5 text-sm text-night-muted">Today's best: <span className="font-semibold text-night-ink">{Math.max(...attempts.map((attempt) => attempt.score))} / {attempts[0]?.total}</span></p>}
  </div>;
}

function QuizQuestionView({ question, index, total, selected, checked, answer, onSelect, onCheck, onContinue, onLeave }: {
  question: QuizQuestion;
  index: number;
  total: number;
  selected: string | null;
  checked: boolean;
  answer: QuizAnswer | undefined;
  onSelect: (value: string) => void;
  onCheck: () => void;
  onContinue: () => void;
  onLeave: () => void;
}) {
  const checkedChoice = checked ? selected?.replace("__checked__", "") : null;
  const letters = ["A", "B", "C", "D"];
  return <div className="quiz-question-panel">
    <div className="flex items-center justify-between gap-4"><Button variant="ghost" size="sm" className="text-night-muted" onClick={onLeave}>Today's words</Button><span className="text-xs font-semibold text-night-muted">{index + 1} of {total}</span></div>
    <div className="mt-5 h-1 overflow-hidden rounded-full bg-night-line"><div className="h-full bg-primary transition-all" style={{ width: `${(index + 1) / total * 100}%` }} /></div>
    <p className="mt-6 text-[10px] font-semibold uppercase tracking-wider text-editorial">{question.type} · {question.word}</p>
    <h2 className="mt-2 max-w-2xl font-display text-2xl font-semibold leading-snug text-night-ink sm:text-3xl">{question.prompt}</h2>
    <div className="mt-5 grid gap-2.5">{question.choices.map((choice, choiceIndex) => {
      const isCorrect = checked && choice === question.answer;
      const isWrong = checked && choice === checkedChoice && choice !== question.answer;
      return <button key={choice} type="button" disabled={checked} aria-pressed={selected === choice || checkedChoice === choice} className={`flex min-h-12 items-start gap-3 border px-3.5 py-3 text-left text-sm leading-5 transition-colors sm:px-4 ${isCorrect ? "border-primary bg-success-soft text-night-ink" : isWrong ? "border-editorial bg-editorial-soft text-night-ink" : checked ? "border-night-line text-night-muted opacity-70" : selected === choice ? "border-primary bg-night-panel text-night-ink" : "border-night-line text-night-ink hover:border-primary/70 hover:bg-night-panel"}`} onClick={() => onSelect(choice)}>
        <span className={`mt-0.5 grid size-5 shrink-0 place-items-center border text-[10px] font-semibold ${isCorrect ? "border-primary bg-primary text-primary-foreground" : isWrong ? "border-editorial text-editorial" : "border-night-line text-night-muted"}`}>{isCorrect ? <Check className="size-3.5" /> : letters[choiceIndex]}</span><span>{choice}</span>
      </button>;
    })}</div>
    {checked && answer && <div className={`mt-4 border p-4 ${answer.correct ? "border-primary/60 bg-success-soft" : "border-editorial/70 bg-editorial-soft"}`}><p className="text-sm font-semibold text-night-ink">{answer.correct ? "Exactly right." : "Not quite — keep this one close."}</p><p className="mt-1 text-sm leading-5 text-night-ink">{question.explanation}</p></div>}
    <Button className="mt-5" disabled={checked ? false : !selected} onClick={checked ? onContinue : onCheck}>{checked ? index + 1 === total ? "See your score" : "Next question" : "Check answer"}{checked && <ArrowRight />}</Button>
    <p className="mt-4 text-center text-xs text-night-muted">Your progress is saved on this device.</p>
  </div>;
}

function QuizResults({ score, questions, answers, onRestart, onArchive }: {
  score: number;
  questions: QuizQuestion[];
  answers: QuizAnswer[];
  onRestart: () => void;
  onArchive: () => void;
}) {
  const message = score === questions.length ? "Every word found its place." : score >= questions.length / 2 ? "A little practice goes a long way." : "Come back to these words tomorrow.";
  return <div className="quiz-result-panel">
    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-night-muted"><Check className="size-4 text-primary" />Tonight’s review, complete</p>
    <h1 className="mt-3 font-display text-4xl font-semibold leading-tight text-night-ink sm:text-5xl">{message}</h1>
    <div className="mt-5 flex items-baseline gap-2"><span className="font-display text-6xl font-semibold text-editorial">{score}</span><span className="text-lg text-night-muted">/ {questions.length}</span></div>
    <p className="mt-1 text-sm text-night-muted">correct answers · added to your learned words</p>
    <div className="mt-6 space-y-3 border-t border-night-line pt-5">{questions.map((question, index) => <div key={`${question.wordId}-${question.type}`} className="border-b border-night-line/70 pb-3"><div className="flex items-start gap-2"><span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${answers[index]?.correct ? "bg-primary text-primary-foreground" : "bg-editorial-soft text-editorial"}`}>{answers[index]?.correct ? <Check className="size-3" /> : <X className="size-3" />}</span><div><p className="text-xs font-semibold text-night-muted">{question.type} · {question.word}</p><p className="mt-1 text-sm text-night-ink">{question.explanation}</p></div></div></div>)}</div>
    <div className="mt-5 flex flex-wrap gap-2"><Button onClick={onRestart}>Practice again <ArrowRight /></Button><Button variant="outline" className="border-night-line text-night-ink hover:bg-night-panel" onClick={onArchive}>View learned words <BookOpen /></Button></div>
  </div>;
}

function ArchiveEntry({ word, onRemove, onSpeak }: { word: VocabularyWord; onRemove: () => void; onSpeak: (word: string) => void }) {
  const [open, setOpen] = useState(false);
  return <article className="py-4">
    <div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><h2 className="font-display text-xl font-semibold">{word.word}</h2><span className="text-xs italic text-muted-foreground">{word.phonetic}</span><span className="text-[10px] uppercase tracking-wider text-muted-foreground">{word.partOfSpeech}</span></div><p className="mt-1 text-sm leading-6">{word.meaning}</p></div><div className="flex shrink-0 items-center gap-1"><Button variant="ghost" size="icon" title={`Hear ${word.word}`} aria-label={`Hear ${word.word}`} onClick={() => onSpeak(word.word)}><Volume2 /></Button><Button variant="ghost" size="icon" title="Remove from learned words" aria-label={`Remove ${word.word} from learned words`} onClick={onRemove}><X /></Button></div></div>
    <Button variant="ghost" size="sm" className="mt-1 -ml-2 text-muted-foreground" aria-expanded={open} onClick={() => setOpen((current) => !current)}>{open ? "Hide details" : "Synonyms, antonyms & examples"}<ChevronDown className={open ? "rotate-180" : ""} /></Button>
    {open && <div className="space-y-3 pt-2"><WordRelation label="Similar" terms={word.synonyms} /><WordRelation label="Opposite" terms={word.antonyms} />{word.examples.map((example) => <p key={example} className="border-l border-editorial pl-3 text-sm leading-5 text-muted-foreground">“{example}”</p>)}</div>}
  </article>;
}
