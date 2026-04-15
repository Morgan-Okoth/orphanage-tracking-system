export default function Home() {
  return (
    <main
      style={{
        minHeight: '100vh',
        padding: 'clamp(1.25rem, 3vw, 3rem)',
        background:
          'radial-gradient(circle at top left, rgba(219, 178, 106, 0.32), transparent 28%), radial-gradient(circle at 85% 20%, rgba(81, 139, 163, 0.22), transparent 25%), linear-gradient(140deg, #f5efe1 0%, #d9e9e8 48%, #b8cfdb 100%)',
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: '1120px',
          margin: '0 auto',
          borderRadius: '28px',
          padding: 'clamp(1.5rem, 4vw, 3.25rem)',
          background: 'rgba(255, 255, 255, 0.9)',
          boxShadow: '0 26px 90px rgba(20, 44, 56, 0.16)',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', alignItems: 'center' }}>
          <div>
            <p style={{ margin: 0, color: '#7a5f2a', fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Bethel Rays of Hope
            </p>
            <h1 style={{ margin: '1rem 0', fontSize: 'clamp(2.4rem, 6vw, 5.2rem)', lineHeight: 0.93, color: '#16323d', maxWidth: '10ch' }}>
              Trust the story behind every disbursement.
            </h1>
            <p style={{ margin: 0, maxWidth: '58ch', fontSize: '1.06rem', lineHeight: 1.8, color: '#365661' }}>
              A public-facing transparency platform for beneficiary support, internal review, audit oversight, and donor confidence.
              Beneficiaries apply, staff handle operations, auditors verify, and well-wishers get a clear path to give.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.85rem', marginTop: '2rem' }}>
              <a href="/donate" style={{ padding: '0.95rem 1.35rem', borderRadius: '999px', background: '#16323d', color: '#fff', textDecoration: 'none', fontWeight: 700 }}>
                Donate
              </a>
              <a href="/public-transparency" style={{ padding: '0.95rem 1.35rem', borderRadius: '999px', background: '#eadab7', color: '#16323d', textDecoration: 'none', fontWeight: 700 }}>
                Transparency Dashboard
              </a>
              <a href="/login" style={{ padding: '0.95rem 1.35rem', borderRadius: '999px', border: '1px solid #8ba7b2', color: '#16323d', textDecoration: 'none', fontWeight: 700 }}>
                Staff and Beneficiary Sign In
              </a>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '1rem' }}>
            {[
              ['Beneficiary onboarding', 'Public registration is now limited to beneficiary accounts. Internal roles are assigned by governance.'],
              ['Role-aware dashboards', 'Login sends each user straight to the screens they actually need instead of forcing role picking on the public site.'],
              ['Donor journey', 'Well-wishers now have a dedicated public donation route instead of being pushed into staff workflows.'],
            ].map(([title, copy], index) => (
              <article
                key={title}
                style={{
                  padding: '1.1rem 1.2rem',
                  borderRadius: '22px',
                  background: index === 1 ? '#16323d' : '#f8fbfb',
                  color: index === 1 ? '#fff' : '#16323d',
                  border: index === 1 ? 'none' : '1px solid #d4e1e6',
                }}
              >
                <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem' }}>{title}</h2>
                <p style={{ margin: 0, lineHeight: 1.7, color: index === 1 ? 'rgba(255,255,255,0.82)' : '#57727d' }}>{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
