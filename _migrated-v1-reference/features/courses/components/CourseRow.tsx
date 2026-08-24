import { useRef } from 'react';
import type { ReactNode } from 'react';

export function CourseRow({ title, children }: { title: string; children: ReactNode }) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const scrollByCards = (direction: 1 | -1) => {
    scrollerRef.current?.scrollBy({ left: direction * 560, behavior: 'smooth' });
  };

  return (
    <section className="mb-10">
      <h2 className="mb-3 text-xl font-bold text-neutral-900 dark:text-neutral-100">{title}</h2>
      <div className="relative">
        <div ref={scrollerRef} className="flex gap-4 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] snap-x">
          {children}
        </div>
        <button
          type="button"
          onClick={() => scrollByCards(1)}
          aria-label={`Scroll ${title} right`}
          className="absolute right-0 top-1/2 hidden -translate-y-1/2 rounded-full border border-neutral-200 bg-white p-2 shadow-md hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800 md:block"
        >
          <svg viewBox="0 0 20 20" className="h-5 w-5 fill-neutral-700 dark:fill-neutral-300" aria-hidden="true">
            <path d="M7 4l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </section>
  );
}
