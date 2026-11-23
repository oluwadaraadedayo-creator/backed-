import type { Release } from './lib'
import { asset } from './asset'

const cv = (n: string) => asset(`/images/covers/${n}.svg`)
const WALL = [
  ['c01', 'Night Drive', '₦5,000'], ['c03', 'Small Hours', 'Pay what you want'], ['c10', 'Market Mornings', '$12'],
  ['c07', 'Live at the Shrine', '₦8,000'], ['c05', 'Shapes of Lagos', '₦4,000'], ['c09', 'Static Bloom', '₦2,500'],
  ['c04', 'Golden Hour EP', '₦3,500'], ['c12', 'Arches', '₦3,000'], ['c02', 'Interlude', '₦1,500'],
]

export function Landing({ onStart, onBrowse, onLogin, releases, onOpen }: { onStart: () => void; onBrowse: () => void; onLogin: () => void; releases: Release[]; onOpen: (r: Release) => void }) {
  const live = releases.filter(r => r.image).slice(0, 9)
  const wall = live.length >= 4
    ? live.map(r => ({ key: r.id, img: r.image, t: r.title, p: r.price ? `₦${r.price.toLocaleString('en-NG')}` : 'Free', r }))
    : WALL.map(([c, t, p]) => ({ key: c, img: cv(c), t, p, r: undefined as Release | undefined }))
  return <main className="lp">
    <div className="lp-bar">We are onboarding our first 20 artists. <button onClick={onStart}>Apply to be one</button></div>
    <section className="lp-hero">
      <div className="lp-hero-copy">
        <h1>Sell your music, film and art. Keep 85%.</h1>
        <p>Backed gives you a page, a link and a checkout. Fans pay without making an account, and the money goes to your bank through Paystack.</p>
        <div className="lp-cta-row"><button className="lp-btn blue" onClick={onStart}>Start selling</button><button className="lp-btn link" onClick={onBrowse}>Browse what is on sale</button></div>
        <p className="lp-fine">Free to join. No monthly fee.</p>
      </div>
      <div className="lp-wall" aria-label="Examples of releases">
        {wall.map(w => <button key={w.key} className="lp-sleeve" onClick={() => w.r ? onOpen(w.r) : onBrowse()}>
          <img src={w.img} alt={`${w.t} cover`} /><span className="lp-sticker">{w.p}</span></button>)}
      </div>
    </section>
    {live.length < 4 && <p className="lp-sample">Example covers. Real drops replace them as artists publish.</p>}

    <section className="lp-sell">
      <h2>What you can sell</h2>
      <div className="lp-cols">
        <button onClick={onBrowse}><img src={cv('c03')} alt="" /><h3>Music</h3><p>Singles, EPs, albums and live recordings. Upload MP3, WAV or FLAC.</p></button>
        <button onClick={onBrowse}><img src={asset('/images/covers/s1.svg')} alt="" /><h3>Film and video</h3><p>Short films and concert films. Upload MP4, MOV or WEBM, and add a free trailer.</p></button>
        <button onClick={onBrowse}><img src={cv('c10')} alt="" /><h3>Digital art</h3><p>Prints, packs and PDFs. Upload JPG, PNG, WEBP or PDF.</p></button>
      </div>
      <p className="lp-fine">Tickets and merch come later.</p>
    </section>

    <section id="how" className="lp-how">
      <h2>From sign up to first sale</h2>
      <ol>
        <li><b>1</b><div><h3>Sign up and add your bank</h3><p>Create your account, then add the bank account where you want to be paid.</p></div></li>
        <li><b>2</b><div><h3>Upload your work</h3><p>Add your files, a cover and a trailer or preview, then set your price.</p></div></li>
        <li><b>3</b><div><h3>Share your link</h3><p>Post your short link anywhere. Each sale lands in your bank.</p></div></li>
      </ol>
    </section>

    <section id="features" className="lp-feat">
      <h2>What helps fans say yes</h2>
      <dl>
        {[['Your own short link', 'Share backed.app/a/yourname and see how many people visit and how many buy.'], ['Pay what you want', 'Set a minimum and let your biggest fans pay more.'], ['Checkout without an account', 'Fans enter a name and email and get their download link at once.'], ['Free previews', 'A clip, a trailer or a sample, so people hear and see before they buy.'], ['Goal campaigns', 'Set a goal for a drop and give fans plaques when it is reached.'], ['Naira and dollars', 'Price in naira today. US dollars for fans abroad, where enabled.']].map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}
      </dl>
    </section>

    <section id="pricing" className="lp-price">
      <h2>You keep 85 of every 100</h2>
      <p>Backed keeps 15%, and covers the card fees. There is no monthly fee and no setup fee.</p>
      <div className="lp-bar-split" role="img" aria-label="85 percent to the artist, 15 percent to Backed"><span style={{ width: '85%' }}>85% to you</span><span style={{ width: '15%' }}>15%</span></div>
    </section>

    <section className="lp-final"><h2>Put your first release up today.</h2><div className="lp-cta-row"><button className="lp-btn ink" onClick={onStart}>Start selling</button><button className="lp-btn link dark" onClick={onLogin}>Already selling? Log in</button></div></section>
  </main>
}
