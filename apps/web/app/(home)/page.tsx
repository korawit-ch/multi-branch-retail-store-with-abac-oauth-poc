import Link from 'next/link';
const personas = [
  {
    id: 'mock-manager-10',
    title: 'Store manager',
    branch: 'Siam Square · Branch 10',
    description: 'Manage inventory, record sales, and prepare orders.',
    initials: 'SM',
  },
  {
    id: 'mock-staff-10',
    title: 'Store staff',
    branch: 'Siam Square · Branch 10',
    description: 'Record sales and prepare orders. Inventory is view only.',
    initials: 'ST',
  },
  {
    id: 'mock-manager-42',
    title: 'Store manager',
    branch: 'Ari Neighborhood · Branch 42',
    description: 'The same tools, scoped to a different branch.',
    initials: 'AM',
  },
  {
    id: 'mock-hq',
    title: 'HQ administrator',
    branch: 'All assigned branches',
    description: 'Switch between branches and oversee daily operations.',
    initials: 'HQ',
  },
];
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="login-page">
      <section className="login-story">
        <Link href="/" className="brand">
          <span className="brand-mark">b.</span> branch & co
        </Link>
        <div>
          <p className="eyebrow">A LITTLE SIMPLER. EVERY DAY.</p>
          <h1>
            Good stores.
            <br />
            Great people.
            <br />
            <em>One workspace.</em>
          </h1>
          <p>
            From the first coffee to the last order,
            <br />
            keep every branch running beautifully.
          </p>
          <div className="store-illustration" aria-hidden="true">
            <div className="awning">BRANCH & CO</div>
            <div className="store-window">
              <span>
                OPEN
                <br />
                <small>something good inside</small>
              </span>
              <div className="shelf">
                ▰ ▰ ▰<br />▰ ▰ ▰
              </div>
            </div>
            <div className="store-base" />
          </div>
        </div>
        <small>Made for the everyday business of running a store.</small>
      </section>
      <section className="login-form">
        <span className="pill green">INTERACTIVE STORE DEMO</span>
        <h2>Make yourself at home.</h2>
        <p className="muted">
          Choose a demo identity to explore your workspace.
        </p>
        {error && (
          <p role="alert" className="error">
            Sign-in failed or expired. Please try again.
          </p>
        )}
        <div className="persona-list">
          {personas.map((p) => (
            <Link
              key={p.id}
              href={`/auth/login?persona=${p.id}`}
              className="persona"
            >
              <div className="avatar">{p.initials}</div>
              <div>
                <h3>
                  {p.title}
                  <span>{p.branch}</span>
                </h3>
                <p>{p.description}</p>
              </div>
              <span aria-hidden="true">↗</span>
            </Link>
          ))}
        </div>
        <div className="login-info">
          <strong>Local OAuth demonstration</strong>
          <p>
            These identities use a mock provider with authorization code, state,
            and PKCE. No external account or password is needed. Permissions and
            branch access come from the application database.
          </p>
        </div>
        <p className="login-bottom">
          Two branches. One shared catalog. Access that fits your role.
        </p>
      </section>
    </main>
  );
}
