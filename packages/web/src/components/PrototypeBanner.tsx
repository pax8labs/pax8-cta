/**
 * Prototype banner - shows development status
 */
export default function PrototypeBanner() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
      <div className="bg-yellow-100 border-t-4 border-yellow-400 px-4 py-2 text-center">
        <p className="text-sm text-yellow-800 font-bold" style={{ fontFamily: 'Architects Daughter, cursive' }}>
          ⚠️ PROTOTYPE IN DEVELOPMENT • NOT FOR PRODUCTION USE • See{' '}
          <a
            href="https://github.com/pax8labs/agentsync/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="underline pointer-events-auto hover:text-yellow-900"
          >
            GitHub Issues #11-20
          </a>
          {' '}for production readiness checklist
        </p>
      </div>
    </div>
  )
}
