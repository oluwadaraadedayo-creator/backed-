import { ArrowRight } from 'lucide-react'
import type { Release } from './lib'
import { asset } from './asset'

const cv = (n: string) => asset(`/images/covers/${n}.svg`)
const SAMPLE = [
  { id: 's1', title: 'Night Drive', price: '₦5,000', image: cv('c01') },
  { id: 's2', title: 'Small Hours', price: 'Pay what you want', image: cv('c03') },
  { id: 's3', title: 'Market Mornings', price: '$12', image: cv('c10') },
]

export function Landing({ onStart, onBrowse, onLogin, releases, onOpen }: { onStart: () => void; onBrowse: () => void; onLogin: () => void; releases: Release[]; onOpen: (r: Release) => void }) {
  const live = releases.slice(0, 3)
  return <main className="lp">
    <div className="lp-bar">We are onboarding our first 20 artists. <button onClick={onStart}>Apply to be one</button></div>
    <section className="lp-hero">
      <span className="lp-chip warm">Built for creators selling music, film and art</span>
      <h1>Sell your work.<br /><em>Get paid directly.</em></h1>
      <p>Backed gives you a page, a link and a checkout. Fans pay in seconds, with no account, and you keep 85% of every sale.</p>
      <div className="lp-cta-row"><button className="lp-btn blue" onClick={onStart}>Start selling, it is free</button><button className="lp-btn ghost" onClick={onBrowse}>Browse drops</button></div>
    </section>
    <section className="lp-mock-wrap"><div className="lp-mock">
      <div className="lp-mock-bar"><i style={{ background: '#FF6B5B' }} /><i style={{ background: '#FFC83D' }} /><i style={{ background: '#36D6A0' }} /><span>backed.app/a/your-name</span></div>
      <div className="lp-mock-body">
        <div className="lp-mock-artist"><img src={asset('/images/covers/p1.svg')} alt="" /><div><b>Your name here</b><span>Filmmaker and musician</span></div><p>Your page shows your drops, a free preview on each, and a Follow button.</p></div>
        <div className="lp-mock-grid">{(live.length ? live.map(r => ({ id: r.id, title: r.title, price: r.price ? `₦${r.price.toLocaleString('en-NG')}` : 'Free', image: r.image, r })) : SAMPLE.map(s => ({ ...s, r: undefined as Release | undefined }))).map(x =>
          <button key={x.id} className="lp-mock-item" onClick={() => x.r ? onOpen(x.r) : onBrowse()}><img src={x.image} alt={`${x.title} cover`} /><b>{x.title}</b><span>{x.price}</span></button>)}</div>
      </div>
    </div>{!live.length && <p className="lp-sample">Example page. Real drops appear here once artists publish.</p>}</section>
    <section className="lp-sell"><h2>Sell music, film and art</h2><p>One place for every kind of digital work you make.</p>
      <div className="lp-three">
        <button onClick={onBrowse}><img src={cv('c03')} alt="" /><h3>Music</h3><span>Singles, EPs, albums and live recordings in MP3, WAV or FLAC.</span></button>
        <button onClick={onBrowse}><img src={asset('/images/covers/s1.svg')} alt="" /><h3>Film and video</h3><span>Short films and concert films in MP4, MOV or WEBM, with a free trailer.</span></button>
        <button onClick={onBrowse}><img src={cv('c10')} alt="" /><h3>Digital art</h3><span>Prints, packs and PDFs in JPG, PNG, WEBP or PDF.</span></button>
      </div><p className="lp-later">Tickets and merch are coming later.</p></section>
    <section id="how" className="lp-band navy"><div className="lp-head"><h2>Simple to set up</h2><p>Three steps from sign up to your first sale.</p></div>
      <div className="lp-steps">
        <div><i style={{ background: '#FFC83D', color: '#141A3C' }}>1</i><h3>Sign up and add your bank</h3><p>Create your account, then add the bank account where you want to be paid.</p></div>
        <div><i style={{ background: '#36D6A0', color: '#141A3C' }}>2</i><h3>Upload your work</h3><p>Add your files, a cover and a trailer or preview, then set your price.</p></div>
        <div><i style={{ background: '#FF6B5B', color: '#fff' }}>3</i><h3>Share your link, get paid</h3><p>Post your short link anywhere. Each sale lands in your bank through Paystack.</p></div>
      </div><div className="lp-center"><button className="lp-btn yellow" onClick={onStart}>Start now</button></div></section>
    <section id="features" className="lp-feat"><div className="lp-head dark"><h2>Everything to sell more</h2><p>Tools that help your fans say yes.</p></div>
      <div className="lp-grid3">
        {[['Your own short link', 'Share backed.app/a/yourname and see how many people visit and how many buy.'], ['Pay what you want', 'Set a minimum and let your biggest fans pay more.'], ['Checkout without an account', 'Fans enter a name and email and get their download link at once.'], ['Free previews', 'Share a clip, a trailer or a sample so people hear and see before they buy.'], ['Goal campaigns', 'Set a goal for a drop and give fans plaques when it is reached.'], ['Naira and dollars', 'Price in naira today, with US dollars for fans abroad where enabled.']].map(([t, d]) => <div key={t} className="lp-feat-card"><h3>{t}</h3><p>{d}</p></div>)}
      </div></section>
    <section id="pricing" className="lp-price"><div><span className="lp-chip mint">Pricing</span><h2>Free to join. We earn when you do.</h2><p>You keep 85% of every sale. Backed keeps 15% and covers the card fees. No monthly fee.</p>
      <div className="lp-split"><div><b className="blue">85%</b><span>to you</span></div><div><b>15%</b><span>to Backed</span></div></div></div></section>
    <section className="lp-band blue"><h2>Ready to put your work out there?</h2><p>Create a free account in a few minutes.</p><div className="lp-cta-row"><button className="lp-btn yellow" onClick={onStart}>Start selling <ArrowRight size={18} /></button><button className="lp-btn outline" onClick={onLogin}>Log in</button></div></section>
  </main>
}
