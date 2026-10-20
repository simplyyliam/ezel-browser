/**
 * The tab's sound state, drawn from lucide's volume-2 / volume-x so it matches the other icons.
 * Playing: the two waves breathe one after the other (static under reduced motion), so a glance
 * tells a tab that's making sound from one that's merely muted. Muted: the speaker with a cross.
 */
export function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
      {muted ? (
        <>
          <path d="m22 9-6 6" />
          <path d="m16 9 6 6" />
        </>
      ) : (
        <>
          <path d="M16 9a5 5 0 0 1 0 6" className="animate-sound-wave motion-reduce:animate-none" />
          <path
            d="M19.364 18.364a9 9 0 0 0 0-12.728"
            className="animate-sound-wave [animation-delay:180ms] motion-reduce:animate-none"
          />
        </>
      )}
    </svg>
  )
}
