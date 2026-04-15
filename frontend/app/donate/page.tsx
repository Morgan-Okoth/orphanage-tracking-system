const donationUrl = process.env.NEXT_PUBLIC_DONATION_URL;

export default function DonatePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        padding: 'clamp(1.5rem, 4vw, 4rem)',
        background:
          'radial-gradient(circle at top, rgba(227, 168, 97, 0.24), transparent 34%), linear-gradient(140deg, #17313b 0%, #214755 45%, #f4efe4 100%)',
      }}
    >
      <section
        style={{
          maxWidth: '980px',
          margin: '0 auto',
          padding: 'clamp(1.5rem, 3vw, 3rem)',
          borderRadius: '28px',
          background: 'rgba(255,255,255,0.92)',
          boxShadow: '0 24px 90px rgba(12, 26, 32, 0.24)',
        }}
      >
        <p style={{ margin: 0, color: '#7d5a27', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Give With Clarity
        </p>
        <h1 style={{ margin: '0.75rem 0 1rem', fontSize: 'clamp(2.3rem, 5vw, 4.4rem)', lineHeight: 0.95, color: '#17313b', maxWidth: '12ch' }}>
          Support a transparent care journey.
        </h1>
        <p style={{ margin: 0, maxWidth: '60ch', color: '#395763', lineHeight: 1.8, fontSize: '1.05rem' }}>
          Well-wishers should not have to guess where money goes. This platform is designed so donations, approvals,
          disbursements, and public transparency data can reinforce each other and build trust.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginTop: '2rem' }}>
          {[
            ['1. Give', 'Use the dedicated donation flow rather than logging in as an internal user.'],
            ['2. Track trust', 'Review the public transparency dashboard to see aggregate disbursement data.'],
            ['3. Stay connected', 'Support with confidence knowing requests move through review, verification, and audit.'],
          ].map(([title, copy]) => (
            <article key={title} style={{ padding: '1rem', borderRadius: '20px', background: '#f9f5ee', border: '1px solid #ecdcc2' }}>
              <h2 style={{ margin: '0 0 0.5rem', color: '#17313b', fontSize: '1.05rem' }}>{title}</h2>
              <p style={{ margin: 0, color: '#4d6670', lineHeight: 1.7 }}>{copy}</p>
            </article>
          ))}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.85rem', marginTop: '2rem' }}>
          <a
            href={donationUrl || 'mailto:info@bethelraysofhope.org?subject=Donation%20Support'}
            style={{
              padding: '0.95rem 1.35rem',
              borderRadius: '999px',
              background: '#17313b',
              color: '#fff',
              textDecoration: 'none',
              fontWeight: 700,
            }}
          >
            {donationUrl ? 'Donate Securely' : 'Request Donation Link'}
          </a>
          <a
            href="/public-transparency"
            style={{
              padding: '0.95rem 1.35rem',
              borderRadius: '999px',
              border: '1px solid #17313b',
              color: '#17313b',
              textDecoration: 'none',
              fontWeight: 700,
            }}
          >
            View Transparency Dashboard
          </a>
        </div>
      </section>
    </main>
  );
}
