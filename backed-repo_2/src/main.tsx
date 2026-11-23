import '@fontsource-variable/archivo/wdth.css'
import '@fontsource/figtree/400.css'
import '@fontsource/figtree/500.css'
import '@fontsource/figtree/600.css'
import '@fontsource/figtree/700.css'
import React, { useContext, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Disc3, Download, Headphones, Heart, Library, LockKeyhole, LogIn, Menu, Music2, Plus, Search, ShieldCheck, ShoppingBag, SlidersHorizontal, Sparkles, TrendingUp, Upload, Wallet, X } from 'lucide-react'
import './styles.css'
import { supabase } from './supabase'
import type { Session } from '@supabase/supabase-js'
import { API, apiCall, CATEGORIES_FALLBACK, groupOf, mapProduct, money, priceLabel, PRODUCT_SELECT, CURRENCY_SYMBOL, MIN_PWYW, MAX_ORDER } from './lib'
import type { CampaignProgress, Category, Maker, Profile, Release } from './lib'
import { asset } from './asset'
import { AuthPage, RecoveryDialog } from './auth'
import { Landing } from './landing'
import { ArtistStudio } from './studio'
import { CampaignCard } from './campaign'
import { OwnedFiles } from './files'
import { ReportDialog } from './report'
import { ArtistPage } from './artistPage'
import { ApplyPage } from './apply'
import { PreviewPlayer } from './previews'
import { InfoPage } from './info'
import type { InfoKind } from './info'
import { contactEmail } from './site'
import GuestOrderPage from './guest/GuestOrderPage'
import GuestCheckoutModal from './guest/GuestCheckoutModal'
import { GUEST_ENABLED } from './guest/guestApi'

type Page = 'landing'|'explore'|'detail'|'checkout'|'library'|'artist'|'admin'|'signin'|'artistPage'|'info'
const ArtistNav = React.createContext<(id:string)=>void>(()=>{})
const EMPTY:Release={id:'',title:'',artist:'',artistId:'',type:'Album',price:0,image:'',description:'',tracks:[],date:''}
const art = {
  // Use image files that are actually present in public/images. The former
  // unsplash-*.jpg placeholders were not included in the repository and returned 404s.
  cover1:asset('/images/art-1.svg'),
  cover2:asset('/images/art-2.svg'),
  cover3:asset('/images/art-3.svg'),
  cover4:asset('/images/art-4.svg'),
  cover5:asset('/images/art-3.svg'),
  cover6:asset('/images/art-2.svg'),
  cover7:asset('/images/art-1.svg'),
  cover8:asset('/images/art-4.svg'),
  artist1:asset('/images/art-1.svg'),
  artist2:asset('/images/art-2.svg'),
  artist3:asset('/images/art-3.svg'),
  artist4:asset('/images/art-4.svg')
}
function readLocal<T>(key:string,fallback:T):T { try { const s=localStorage.getItem(key); return s?JSON.parse(s) as T:fallback } catch { return fallback } }
function writeLocal<T>(key:string,value:T):void { try { localStorage.setItem(key,JSON.stringify(value)) } catch { /* Storage can be disabled or full; keep the app usable in memory. */ } }
function App(){
 const [page,setPage]=useState<Page>('landing'); const [releases,setReleases]=useState<Release[]>([]); const [trendingIds,setTrendingIds]=useState<string[]>([]); const [selected,setSelected]=useState<Release>(EMPTY); const [search,setSearch]=useState(''); const [category,setCategory]=useState('All'); const [slide,setSlide]=useState(0); const [menuOpen,setMenuOpen]=useState(false); const [showSearch,setShowSearch]=useState(false); const [toast,setToast]=useState(''); const [checkoutEmail,setCheckoutEmail]=useState(''); const [pendingOrder,setPendingOrder]=useState(false); const [draft,setDraft]=useState({title:'',artist:'',type:'EP',price:'3500',description:'',tracks:'',image:''}); const [draftMode,setDraftMode]=useState<'new'|'edit'>('new'); const [editingId,setEditingId]=useState<string|null>(null); const [tab,setTab]=useState<'overview'|'releases'|'orders'>('overview'); const [showDemoInfo,setShowDemoInfo]=useState(false)
 const [session,setSession]=useState<Session|null>(null)
 const [profile,setProfile]=useState<Profile|null>(null)
 const [owned,setOwned]=useState<Release[]>([])
 const [libVersion,setLibVersion]=useState(0)
 const [paying,setPaying]=useState(false)
 const [guestOpen,setGuestOpen]=useState(false)
 const [chargedBy,setChargedBy]=useState('')
 useEffect(()=>{ if(page!=='checkout'||chargedBy)return; apiCall<{chargedBy?:string}>('/api/config',{method:'GET'}).then(r=>{ if(r.ok&&typeof r.data?.chargedBy==='string')setChargedBy(r.data.chargedBy) }) },[page])
 const [payAmount,setPayAmount]=useState('')
 const [quantity,setQuantity]=useState(1)
 const [campaign,setCampaign]=useState<CampaignProgress|null>(null)
 const [authNote,setAuthNote]=useState('')
 const [afterAuth,setAfterAuth]=useState<Page>('explore'); const [authMode,setAuthMode]=useState<'signin'|'signup'>('signin')
 const [makers,setMakers]=useState<Maker[]>([])
 const [follows,setFollows]=useState<string[]>([])
 const [reporting,setReporting]=useState(false)
 const [artistId,setArtistId]=useState('')
 const [infoKind,setInfoKind]=useState<InfoKind>('terms')
 const [recovery,setRecovery]=useState(false)
 const [cats,setCats]=useState<Category[]>(CATEGORIES_FALLBACK)
 const [catGroup,setCatGroup]=useState<'all'|'music'|'fashion'|'others'>('all')
 const [catSlug,setCatSlug]=useState('all')
 useEffect(()=>{
  if(!supabase)return
  supabase.from('categories').select('*').order('sort').then(({data})=>{ if(Array.isArray(data)&&data.length)setCats(data as Category[]) })
 },[])
 useEffect(()=>{
  const apply=()=>{
   const m=window.location.hash.match(/^#\/artist\/([0-9a-f-]{36})$/i)
   const short=window.location.hash.match(/^#\/a\/([a-z0-9][a-z0-9-]{0,39})$/i)
   setMenuOpen(false)
   if(short&&supabase){
    // Short link: look up the artist, then show the same page as the long link. An unknown name shows "could not find that artist".
    supabase.rpc('resolve_artist_slug',{p_slug:short[1].toLowerCase()}).then(({data})=>{
     setArtistId(typeof data==='string'?data.toLowerCase():'00000000-0000-0000-0000-000000000000');setPage('artistPage');window.scrollTo({top:0})
    })
    return
   }
   const info=window.location.hash.match(/^#\/(terms|privacy|refunds|about|help)$/)
   if(m){setArtistId(m[1].toLowerCase());setPage('artistPage');window.scrollTo({top:0})}
   else if(info){setInfoKind(info[1] as InfoKind);setPage('info');window.scrollTo({top:0})}
   else setPage(p=>p==='artistPage'||p==='info'?'landing':p)
  }
  apply()
  window.addEventListener('hashchange',apply)
  return()=>window.removeEventListener('hashchange',apply)
 },[])
 const openArtist=(id:string)=>{ if(id)window.location.hash=`#/artist/${id}` }
 const [acctOpen,setAcctOpen]=useState(false)
 useEffect(()=>{
  if(!acctOpen)return
  const close=(e:MouseEvent)=>{ if(!(e.target as HTMLElement).closest('.acct'))setAcctOpen(false) }
  document.addEventListener('click',close)
  return()=>document.removeEventListener('click',close)
 },[acctOpen])
 const signOut=async()=>{
  setAcctOpen(false)
  await supabase?.auth.signOut({scope:'local'})
  setSession(null);setProfile(null);setOwned([]);setFollows([])
  setToast('Signed out.');go('landing')
 }
 const [artistFollowers,setArtistFollowers]=useState(0)
 useEffect(()=>{
  if(!supabase)return
  supabase.rpc('makers_list',{p_limit:12}).then(({data})=>{ if(Array.isArray(data))setMakers(data as Maker[]) })
 },[])
 useEffect(()=>{
  if(!supabase||!session){setFollows([]);return}
  supabase.from('follows').select('creator_id').eq('follower_id',session.user.id).then(({data})=>setFollows((data||[]).map((r:any)=>r.creator_id)))
 },[session?.user.id])
 useEffect(()=>{
  setArtistFollowers(0)
  if(!supabase||page!=='detail'||!selected.artistId)return
  supabase.rpc('follower_counts',{p_ids:[selected.artistId]}).then(({data})=>{ if(Array.isArray(data)&&data[0])setArtistFollowers(data[0].followers) })
 },[selected.artistId,page])
 const toggleFollow=async(creatorId:string)=>{
  if(!supabase||!creatorId)return
  if(!session){setAfterAuth(page);setAuthNote('Sign in to follow artists.');go('signin');return}
  if(creatorId===session.user.id){setToast('You cannot follow yourself.');return}
  const on=follows.includes(creatorId),delta=on?-1:1
  setFollows(f=>on?f.filter(x=>x!==creatorId):[...f,creatorId])
  setMakers(m=>m.map(x=>x.id===creatorId?{...x,followers:Math.max(0,x.followers+delta)}:x))
  if(selected.artistId===creatorId)setArtistFollowers(n=>Math.max(0,n+delta))
  const {error}=on?await supabase.from('follows').delete().eq('follower_id',session.user.id).eq('creator_id',creatorId):await supabase.from('follows').insert({follower_id:session.user.id,creator_id:creatorId})
  if(error){
   setFollows(f=>on?[...f,creatorId]:f.filter(x=>x!==creatorId))
   setMakers(m=>m.map(x=>x.id===creatorId?{...x,followers:Math.max(0,x.followers-delta)}:x))
   if(selected.artistId===creatorId)setArtistFollowers(n=>Math.max(0,n-delta))
   setToast('Could not update your follow. Try again.')
  }
 }
 useEffect(()=>{
  if(!supabase)return
  supabase.from('products').select(PRODUCT_SELECT).eq('status','published').order('published_at',{ascending:false}).then(({data,error})=>{ if(!error&&data)setReleases(data.map(mapProduct)) })
 },[])
 useEffect(()=>{
  if(!supabase)return
  supabase.rpc('trending_release_ids',{p_days:14,p_limit:8}).then(({data,error})=>{ if(!error&&Array.isArray(data))setTrendingIds(data.map((r:{product_id:string})=>r.product_id)) })
 },[])
 useEffect(()=>{
  if(!supabase)return
  supabase.auth.getSession().then(({data})=>setSession(data.session))
  const {data:sub}=supabase.auth.onAuthStateChange((e,s)=>{setSession(s);if(e==='PASSWORD_RECOVERY')setRecovery(true)})
  return()=>sub.subscription.unsubscribe()
 },[])
 useEffect(()=>{
  if(!supabase||!session){setProfile(null);setOwned([]);return}
  supabase.from('profiles').select('id,display_name,role,verified_artist').eq('id',session.user.id).single().then(({data})=>setProfile((data as Profile)||null))
  supabase.from('orders').select(`id,paid_at,product:products(${PRODUCT_SELECT})`).eq('buyer_id',session.user.id).eq('status','paid').order('paid_at',{ascending:false}).then(({data})=>setOwned((data||[]).map((o:any)=>o.product).filter(Boolean).map(mapProduct)))
 },[session?.user.id,libVersion])
 useEffect(()=>{
  setCampaign(null)
  if(!supabase||page!=='detail'||!selected.id)return
  let off=false
  supabase.from('campaigns').select('id').eq('product_id',selected.id).neq('status','ended').or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`).order('created_at',{ascending:false}).limit(1).then(async({data})=>{
   if(off||!data?.length)return
   const {data:prog}=await supabase!.rpc('campaign_progress',{p_campaign:data[0].id})
   if(!off&&prog)setCampaign(prog as CampaignProgress)
  })
  return()=>{off=true}
 },[selected.id,page])
 const payNow=async()=>{
  if(paying)return
  if(!supabase||!API){setToast('Payments are not connected yet.');return}
  const pwyw=selected.pricingMode==='pay_what_you_want'
  const amt=Math.round(Number(payAmount))
  if(pwyw&&(!Number.isFinite(amt)||amt<(selected.minPrice||MIN_PWYW[selected.currency||'NGN']))){setToast(`The minimum for this release is ${money(selected.minPrice||MIN_PWYW[selected.currency||'NGN'],selected.currency)}.`);return}
  if((pwyw?amt:selected.price)*quantity>MAX_ORDER[selected.currency||'NGN']){setToast(`One order is limited to ${money(MAX_ORDER[selected.currency||'NGN'],selected.currency)}. Choose fewer units.`);return}
  if(!session){
   if(GUEST_ENABLED){setGuestOpen(true);return}
   setAfterAuth('checkout');setAuthNote('Sign in or create an account to buy. Your library then follows you to any device.');go('signin');return
  }
  setPaying(true);setToast('Taking you to Paystack...')
  const r=await apiCall<{authorizationUrl?:string;error?:string}>('/api/initialize-payment',{auth:true,body:{productId:selected.id,amount:pwyw?amt:undefined,quantity}})
  if(!r.ok||!r.data.authorizationUrl){setToast(r.data.error||'Could not start payment.');setPaying(false);return}
  window.location.href=r.data.authorizationUrl
 }
 useEffect(()=>{
  const ref=new URLSearchParams(window.location.search).get('reference')
  if(!ref||!/^bkd_[a-f0-9-]{36}$/i.test(ref))return
  setToast('Confirming your payment...')
  apiCall<{verified?:boolean;error?:string}>('/api/verify-payment',{body:{reference:ref}}).then(r=>{
   window.history.replaceState({},'',window.location.pathname)
   if(r.ok&&r.data.verified){setToast('Payment confirmed. It is in your library.');setLibVersion(v=>v+1);setPage('library')}
   else setToast(r.data.error||'We could not confirm that payment.')
  })
 },[])
 useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),3200);return()=>clearTimeout(t)},[toast]);
 const featured=useMemo(()=>[...releases].filter(r=>r.published!==false).slice(0,4),[releases]);
 const filtered=useMemo(()=>releases.filter(r=>r.published!==false && (catGroup==='all'||groupOf(r.category)===catGroup) && (catSlug==='all'||r.category===catSlug) && (category==='All'||(category==='Albums & EPs'&&/Album|EP/.test(r.type))||(category==='Singles'&&r.type.includes('Single'))||(category==='Live & Video'&&/Live|Video/.test(r.type))||(category==='Exclusive'&&(r.tag==='Exclusive'||!!r.benefits?.length))) && `${r.title} ${r.artist} ${r.type}`.toLowerCase().includes(search.toLowerCase())),[releases,category,search,catGroup,catSlug]);
  const trending=trendingIds.map(id=>filtered.find(r=>r.id===id)).filter((r):r is Release=>Boolean(r)).slice(0,4)   // ranked by the server: most bought in the last 14 days
 const go=(p:Page)=>{if(p!=='artistPage'&&p!=='info'&&window.location.hash)window.history.replaceState(null,'',window.location.pathname+window.location.search);setPage(p);setMenuOpen(false);setShowSearch(false);window.scrollTo({top:0,behavior:'smooth'})};
 const openRelease=(r:Release)=>{setSelected(r);go('detail')};
 const logIn=()=>{setAuthNote('');setAuthMode('signin');setAfterAuth('explore');go('signin')};
 const startSelling=()=>{if(session){go('artist');return}setAuthNote('Create your account, then apply to sell. It takes a minute.');setAuthMode('signup');setAfterAuth('artist');go('signin')};
 const scrollTo=(id:string)=>{if(page!=='landing')go('landing');setTimeout(()=>document.getElementById(id)?.scrollIntoView({behavior:'smooth'}),80)};
 const startCheckout=(r:Release)=>{setSelected(r);setPendingOrder(false);setPayAmount(String(r.price));setQuantity(1);go('checkout')};
 const next=()=>setSlide(v=>(v+1)%Math.max(1,featured.length)); const prev=()=>setSlide(v=>(v-1+Math.max(1,featured.length))%Math.max(1,featured.length));
 const categories=['All','Albums & EPs','Singles','Live & Video','Exclusive'];
 return <ArtistNav.Provider value={openArtist}><div className="app-shell">
  {(!supabase||!API)&&<div className="demo-strip"><span className="demo-dot"/> Setup incomplete <span className="strip-separator">/</span> Accounts or payments are not connected yet.</div>}
  <header className="topbar"><button className="wordmark" onClick={()=>go(session?'explore':'landing')} aria-label="Backed home"><img className="brand-logo" src={asset('/images/backed-logo.svg')} alt="Backed" /></button>
   <nav className={`nav-links ${menuOpen?'open':''}`} aria-label="Main navigation"><button onClick={()=>scrollTo('how')}>How it works</button><button onClick={()=>scrollTo('features')}>Features</button><button onClick={()=>scrollTo('pricing')}>Pricing</button><button className={page==='explore'?'active':''} onClick={()=>go('explore')}>Browse drops</button>{session&&<button className={page==='library'?'active':''} onClick={()=>go('library')}>My library</button>}</nav>
   <div className="top-actions"><button className="icon-btn search-toggle" aria-label="Search releases" onClick={()=>{setShowSearch(v=>!v);go('explore');setTimeout(()=>document.getElementById('market-search')?.focus(),50)}}><Search size={18}/></button>{session?<div className="acct"><button className="sign-in" aria-haspopup="menu" aria-expanded={acctOpen} onClick={()=>setAcctOpen(v=>!v)}>{profile?.display_name||'Account'} <ChevronDown size={14}/></button>{acctOpen&&<div className="acct-menu" role="menu"><button role="menuitem" onClick={()=>{setAcctOpen(false);go('library')}}>My Library</button><button role="menuitem" onClick={()=>{setAcctOpen(false);go('artist')}}>{profile?.role==='artist'?'Creator studio':'For artists'}</button><button role="menuitem" className="danger" onClick={signOut}>Sign out</button></div>}</div>:<><button className="sign-in" onClick={logIn}><LogIn size={16}/> Log in</button><button className="btn btn-accent start-btn" onClick={startSelling}>Start selling</button></>}<button className="mobile-menu icon-btn" onClick={()=>setMenuOpen(v=>!v)} aria-label="Toggle menu">{menuOpen?<X/>:<Menu/>}</button></div>
  </header>
  {page==='landing'&&<Landing onStart={startSelling} onBrowse={()=>go('explore')} onLogin={logIn} releases={releases} onOpen={openRelease}/>}
  {page==='explore'&&<main>
   <section className="browse-head"><h1>Find something to back.</h1><p>Music, film and art, straight from the people who made it.</p></section>
   <section className="search-row" id="discover"><div><span className="section-kicker">The collection</span><h2>Every drop</h2></div><div className={`search-box ${showSearch?'search-visible':''}`}><Search size={18}/><input id="market-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search artists, releases..."/><button onClick={()=>{setSearch('');setCategory('All')}} aria-label="Clear search"><X size={16}/></button></div></section>
   <div className="cat-filter"><div className="filters" role="tablist" aria-label="Categories">{(['all','music','fashion','others'] as const).map(g=>{const open=g==='all'||cats.some(c=>c.group_name===g&&c.enabled);return <button key={g} role="tab" aria-selected={catGroup===g} className={catGroup===g?'selected':''} onClick={()=>{setCatGroup(g);setCatSlug('all')}}>{g==='all'?'Everything':g==='others'?'Film and art':g[0].toUpperCase()+g.slice(1)}{!open&&<em className="soon">Soon</em>}</button>})}</div>{catGroup!=='all'&&<div className="filters sub">{[{slug:'all',label:`All ${catGroup}`,enabled:true},...cats.filter(c=>c.group_name===catGroup)].map(c=><button key={c.slug} disabled={!c.enabled} className={catSlug===c.slug?'selected':''} onClick={()=>setCatSlug(c.slug)}>{c.label}{!c.enabled&&<em className="soon">Soon</em>}</button>)}</div>}</div>
   <div className="filter-row"><div className="filters">{categories.map(c=><button key={c} className={category===c?'selected':''} onClick={()=>setCategory(c)}>{c}</button>)}</div><span className="results-count"><SlidersHorizontal size={14}/> {filtered.length} releases</span></div>
   {catGroup==='all'&&catSlug==='all'&&<><ReleaseSection title="Discovered on Backed" subtitle="Good things travel by word of mouth." releases={filtered.slice(0,4)} onOpen={openRelease} onBuy={startCheckout} onSeeAll={()=>{setCategory('All');document.getElementById('all-releases')?.scrollIntoView({behavior:'smooth'})}}/>
   <section className="dark-feature"><div className="dark-feature-copy"><span className="section-kicker light">Made for the moment</span><h2>More than a stream.<br/>Something to keep.</h2><p>Buy a release, get closer to the process. From bonus tracks to studio diaries, every drop can hold a little more.</p><button className="btn btn-accent" onClick={()=>{setCategory('Exclusive');document.getElementById('exclusive')?.scrollIntoView({behavior:'smooth'})}}>Explore exclusive access <ArrowRight size={17}/></button></div><div className="dark-feature-visual"><img src={art.cover5} alt="Artist studio session"/><div className="exclusive-stamp"><Sparkles size={18}/><span>The<br/>extra<br/>take</span></div></div></section>
   {trending.length>0&&<ReleaseSection id="trending" title="Moving right now" subtitle="The most bought in the last two weeks." releases={trending} onOpen={openRelease} onBuy={startCheckout} icon={<TrendingUp size={17}/>}/>}
   <ReleaseSection id="exclusive" title="A little extra, just for you" subtitle="Bonus material, behind-the-scenes and more to take home." releases={filtered.filter(r=>r.tag==='Exclusive'||r.benefits?.length).slice(0,4)} onOpen={openRelease} onBuy={startCheckout} onSeeAll={()=>{setCategory('Exclusive');document.getElementById('discover')?.scrollIntoView({behavior:'smooth'})}}/>
   <ReleaseSection title="Fresh off the press" subtitle="The newest things from independent artists." releases={[...filtered].sort((a,b)=>String(b.date ?? '').localeCompare(String(a.date ?? ''))).slice(0,4)} onOpen={openRelease} onBuy={startCheckout} icon={<Sparkles size={17}/>}/>
   {makers.length>0&&<section className="artists-section"><div className="section-head"><div><span className="section-kicker">Meet the makers</span><h2>Know the name.<br/>Feel the work.</h2></div><button className="text-link" onClick={()=>go('artist')}>Artists, start here <ArrowUpRight size={16}/></button></div><div className="artist-grid">{makers.map((a,i)=><article className="artist-card" key={a.id}><button className="artist-photo" onClick={()=>openArtist(a.id)} aria-label={`See releases by ${a.displayName}`}><img src={a.avatarUrl||a.coverImage||art.cover5} alt=""/><span>{String(i+1).padStart(2,'0')}</span><ArrowUpRight size={19}/></button><div className="artist-meta"><div><h3><button className="release-title" onClick={()=>openArtist(a.id)}>{a.displayName}</button></h3><p>{a.categories.join(' · ')}{a.categories.length?' · ':''}{a.followers.toLocaleString('en-NG')} {a.followers===1?'follower':'followers'}</p></div><button className={`follow-btn ${follows.includes(a.id)?'on':''}`} onClick={()=>toggleFollow(a.id)}>{follows.includes(a.id)?'Following':'Follow'}</button></div>{a.bio&&<p className="artist-bio" style={{textAlign:'left',maxWidth:'none',marginTop:6}}>{a.bio}</p>}</article>)}</div></section>}
   <section className="artist-cta"><div className="cta-orbit"><img src={asset('/images/backed-logo.svg')} alt="Backed"/></div><div><span className="section-kicker">Your work, your people.</span><h2>Make something.<br/>Put it out there.</h2><p>Set your price. Tell your story. Let your audience support the work directly.</p></div><button className="btn btn-dark" onClick={()=>go('artist')}>Start as an artist <ArrowUpRight size={17}/></button></section></>}
   {catGroup!=='all'&&!cats.some(c=>c.group_name===catGroup&&c.enabled)&&<div className="coming-soon"><div><b>{catGroup==='others'?'Film and art':catGroup[0].toUpperCase()+catGroup.slice(1)} is coming soon.</b><br/>We are opening new categories once music is running smoothly.</div></div>}
   <section id="all-releases" className="all-releases"><div className="section-head"><div><span className="section-kicker">Keep exploring</span><h2>All releases <span className="count-pill">{filtered.length}</span></h2></div></div>{filtered.length?<div className="release-grid">{filtered.map(r=><ReleaseCard key={r.id} release={r} onOpen={openRelease} onBuy={startCheckout}/>)}</div>:<Empty title="Nothing found just yet" text="Try a different search or category." action={()=>{setSearch('');setCategory('All');setCatGroup('all');setCatSlug('all')}} actionLabel="Reset filters"/>}</section>
  </main>}
  {page==='detail'&&<main className="page-main"><button className="back-link" onClick={()=>go('explore')}><ArrowLeft size={16}/> Back to Explore</button><section className="detail-layout"><div className="detail-cover"><img src={selected.image} alt={`${selected.title} cover artwork`}/><span className="cover-label">Released on Backed</span></div><div className="detail-info"><span className="section-kicker">{selected.type}</span><h1>{selected.title}</h1><button className="detail-artist" onClick={()=>{if(selected.artistId)openArtist(selected.artistId);else{setSearch(selected.artist);go('explore')}}}>{selected.artist} <ArrowUpRight size={16}/></button><div className="detail-actions-row">{selected.artistId&&selected.artistId!==session?.user.id&&<button className={`follow-btn ${follows.includes(selected.artistId)?'on':''}`} onClick={()=>toggleFollow(selected.artistId)}>{follows.includes(selected.artistId)?'Following':'Follow'}</button>}{selected.artistId&&<span>{artistFollowers.toLocaleString('en-NG')} {artistFollowers===1?'follower':'followers'}</span>}</div><p className="detail-description">{selected.description}</p>{campaign&&<><CampaignCard c={campaign}/>{!owned.some(o=>o.id===selected.id)&&<button className="btn btn-accent" onClick={()=>startCheckout(selected)}>Back this release <ArrowUpRight size={18}/></button>}</>}{owned.some(o=>o.id===selected.id)&&<OwnedFiles key={selected.id} productId={selected.id} setToast={setToast}/>}{selected.id&&!owned.some(o=>o.id===selected.id)&&<PreviewPlayer key={selected.id} productId={selected.id}/>}<div className="detail-price-row"><div><span className="tiny-label">{selected.pricingMode==='pay_what_you_want'?'Pay what you want':'Own this release'}</span><strong>{priceLabel(selected)}</strong>{selected.pricingMode==='pay_what_you_want'&&<span className="pwyw-note">Suggested {money(selected.price,selected.currency)}</span>}</div>{owned.some(o=>o.id===selected.id)?<span className="status-pill"><span/>In your library</span>:<button className="btn btn-accent" onClick={()=>startCheckout(selected)}>Buy release <ArrowUpRight size={18}/></button>}</div><p className="secure-note"><LockKeyhole size={14}/> Secure checkout · One-time purchase · Price in NGN</p><div className="detail-divider"/><h3>What’s included</h3><ul className="benefit-list">{(selected.benefits?.length?selected.benefits:['Digital release','Access from your personal library']).map(b=><li key={b}><BadgeCheck size={17}/>{b}</li>)}</ul><div className="detail-divider"/><div className="track-head"><h3>Tracklist <span>{selected.tracks.length} tracks</span></h3><span className="tiny-label">Digital release</span></div><ol className="track-list">{selected.tracks.map((t,i)=><li key={`${t}-${i}`}><span className="track-number">{String(i+1).padStart(2,'0')}</span><span>{t}</span><span className="track-length">—</span></li>)}</ol><div className="artist-note"><div className="artist-note-icon"><Music2/></div><div><span className="tiny-label">From the artist</span><p>“Thank you for supporting the work directly. Every purchase helps make the next one possible.”</p><b>{selected.artist}</b></div></div><p className="detail-actions-row"><button className="report-link" onClick={()=>setReporting(true)}>Report a copyright or content problem</button></p></div></section><section className="detail-more"><div className="section-head"><div><span className="section-kicker">Keep listening</span><h2>More from the collection</h2></div></div><div className="release-grid">{releases.filter(r=>r.id!==selected.id).slice(0,4).map(r=><ReleaseCard key={r.id} release={r} onOpen={openRelease} onBuy={startCheckout}/>)}</div></section></main>}
  {page==='checkout'&&<main className="page-main checkout-page"><button className="back-link" onClick={()=>go('detail')}><ArrowLeft size={16}/> Back to release</button><div className="checkout-wrap"><div className="checkout-heading"><span className="section-kicker">Checkout</span><h1>Make it <em>yours.</em></h1><p>One small step between you and the music.</p></div><div className="checkout-card"><div className="order-summary"><img src={selected.image} alt=""/><div><span className="tiny-label">Your order</span><h3>{selected.title}</h3><p>{selected.artist} · {selected.type}</p></div></div>
  {selected.pricingMode==='pay_what_you_want'?<><label className="field-label" htmlFor="pay-amount">Choose your price ({CURRENCY_SYMBOL[selected.currency||'NGN']})</label><input id="pay-amount" className="field" type="number" min={selected.minPrice||MIN_PWYW[selected.currency||'NGN']} step="1" inputMode="numeric" value={payAmount} onChange={e=>setPayAmount(e.target.value)}/><span className="field-help">Minimum {money(selected.minPrice||MIN_PWYW[selected.currency||'NGN'],selected.currency)}. Suggested {money(selected.price,selected.currency)}. Most of what you pay goes to the artist.</span></>:<div className="checkout-line"><span>Price per unit</span><b>{money(selected.price,selected.currency)}</b></div>}
  <div className="qty-row"><span className="field-label" style={{margin:0}}>Units</span><div className="qty"><button aria-label="Fewer units" disabled={quantity<=1} onClick={()=>setQuantity(q=>Math.max(1,q-1))}>−</button><span aria-live="polite">{quantity}</span><button aria-label="More units" disabled={quantity>=10} onClick={()=>setQuantity(q=>Math.min(10,q+1))}>+</button></div></div><span className="field-help">You always get one copy. Extra units are extra support for the artist and count toward their campaign goal. Up to 10 per order.</span>
  <div className="checkout-total"><span>Total{quantity>1?` · ${quantity} units`:''}</span><strong>{money((selected.pricingMode==='pay_what_you_want'?(Number(payAmount)||0):selected.price)*quantity,selected.currency)}</strong></div>
 {session?<p className="field-help">Your receipt and access are linked to {session.user.email}.</p>:GUEST_ENABLED?<div className="inline-alert"><LockKeyhole size={18}/><div><b>Buy without an account</b><p>Pay with just your name and email. Your download link arrives right after payment and by email. Prefer an account? You can sign in on the next step.</p></div></div>:<div className="inline-alert"><LockKeyhole size={18}/><div><b>Sign in to buy</b><p>Your purchase is saved to your account so it follows you to any device.</p></div></div>}
  <div className="payment-placeholder"><Wallet size={19}/><div><b>Secure payment with Paystack</b><span>You will be taken to Paystack to pay.</span></div><LockKeyhole size={16}/></div>
  {chargedBy&&<p className="charged-by">Collected by <b>{chargedBy}</b></p>}
 <button className="btn btn-dark full-btn" disabled={paying} onClick={payNow}>{session?(paying?'Please wait...':'Continue to payment'):(GUEST_ENABLED?'Continue as guest':'Sign in to continue')} <ArrowRight size={18}/></button>
  <p className="checkout-terms"><LockKeyhole size={13}/><span>By paying you agree to our <a href="#/terms" target="_blank" rel="noopener">Terms</a> and <a href="#/refunds" target="_blank" rel="noopener">refund policy</a>. Your payment is confirmed by our server before anything is unlocked.</span></p><p className="field-help">Problem with a payment or download? {contactEmail?<>Email support at <a href={`mailto:${contactEmail}`}>{contactEmail}</a></>:null}</p></div><div className="checkout-assurance"><div><ShieldCheck/><span>Every payment<br/>verified</span></div><div><Library/><span>Your releases<br/>in one library</span></div><div><Headphones/><span>Support the artist<br/>directly</span></div></div></div></main>}
  {page==='library'&&<main className="page-main"><div className="page-title-row"><div><span className="section-kicker">Your collection</span><h1>My <em>Library.</em></h1><p>Your purchased releases, all in one place.</p></div>{session&&<div className="library-user"><div className="user-circle">{(profile?.display_name||session.user.email||'F')[0].toUpperCase()}</div><span>{profile?.display_name||'Account'}<br/><button className="text-link" onClick={signOut}>Sign out</button></span></div>}</div>
  {!session?<Empty title="Sign in to see your library" text="Your purchases are saved to your account." action={()=>{setAfterAuth('library');setAuthNote('');go('signin')}} actionLabel="Sign in"/>:<><div className="section-head library-heading"><div><span className="section-kicker">Collected by you</span><h2>Purchased releases <span className="count-pill">{owned.length}</span></h2></div></div>{owned.length?<div className="release-grid">{owned.map(r=><ReleaseCard key={r.id} release={r} onOpen={openRelease} onBuy={openRelease}/>)}</div>:<Empty title="Your library is waiting" text="When you buy a release and your payment is verified, it will appear here." action={()=>go('explore')} actionLabel="Explore releases"/>}</>}</main>}
  {page==='artist'&&(profile?.role==='artist'?<ArtistStudio profile={profile} setToast={setToast} openRelease={openRelease} onSignOut={signOut} onProfileUpdated={u=>setProfile(p=>p?{...p,...u}:p)}/>:<ApplyPage session={session} profile={profile} onSignIn={()=>{setAfterAuth('artist');setAuthNote('Create an account or sign in to apply to sell on Backed.');go('signin')}} onExplore={()=>go('explore')} setToast={setToast}/>)}
  {page==='artistPage'&&artistId&&<ArtistPage key={artistId} artistId={artistId} following={follows.includes(artistId)} isSelf={session?.user.id===artistId} onFollow={toggleFollow} onBack={()=>go('explore')} setToast={setToast} onBuy={startCheckout} ownedIds={owned.map(o=>o.id)} renderCard={r=><ReleaseCard key={r.id} release={r} onOpen={openRelease} onBuy={startCheckout}/>}/>}
  {page==='info'&&<InfoPage kind={infoKind} onBack={()=>go('explore')}/>}
  {page==='admin'&&<main className="page-main"><div className="dashboard-top"><div><span className="section-kicker">Operations · demo</span><h1>Marketplace overview.</h1><p>A basic operational view for Backed administrators.</p></div><div className="admin-pill"><ShieldCheck size={16}/> Admin preview</div></div><div className="metric-grid"><Metric icon={<Disc3/>} label="Listed releases" value={String(releases.filter(r=>r.published!==false).length)} note="Sample and browser demo data"/><Metric icon={<ShoppingBag/>} label="Verified orders" value="0" note="Payment verification not connected"/><Metric icon={<Wallet/>} label="Gross merchandise value" value="₦0" note="No real transactions recorded"/></div><div className="admin-grid"><div className="dashboard-panel"><div className="panel-head"><div><h2>Content review</h2><p>Newly published demo releases.</p></div></div>{releases.slice(0,5).map(r=><div className="admin-row" key={r.id}><img src={r.image} alt=""/><div><b>{r.title}</b><span>{r.artist}</span></div><span className="status-pill"><span/>Demo listing</span><button className="text-link" onClick={()=>openRelease(r)}>Review</button></div>)}</div><div className="dashboard-panel"><div className="panel-head"><div><h2>Operational checks</h2><p>Production readiness indicators.</p></div></div>{[['Supabase authentication','Not connected'],['Payment verification','Not connected'],['Protected media delivery','Not connected'],['Refund and dispute workflow','Not connected'],['Audit logging','Not connected']].map(([a,b])=><div className="check-row" key={a}><span>{a}</span><span className="warning-status"><i/>{b}</span></div>)}</div></div></main>}
  {page==='signin'&&<AuthPage key={authMode} initialMode={authMode} note={authNote} setToast={setToast} onDone={()=>{setAuthNote('');const t=afterAuth;setAfterAuth('explore');if(t==='artistPage'&&artistId)openArtist(artistId);else go(t);setToast('Signed in.')}}/>}
  {recovery&&session&&<RecoveryDialog onDone={()=>{setRecovery(false);setToast('Password updated.')}} onCancel={()=>setRecovery(false)} setToast={setToast}/>}
  {reporting&&selected.id&&<ReportDialog productId={selected.id} title={selected.title} onClose={()=>setReporting(false)} setToast={setToast}/>}
    {guestOpen&&selected.id&&<GuestCheckoutModal productId={selected.id} title={selected.title} amount={selected.pricingMode==='pay_what_you_want'?Math.round(Number(payAmount)):undefined} quantity={quantity} onClose={()=>setGuestOpen(false)} onSignIn={()=>{setGuestOpen(false);setAfterAuth('checkout');setAuthNote('Sign in or create an account to buy. Your library then follows you to any device.');go('signin')}}/>}<footer className="footer"><div className="footer-top"><button className="wordmark footer-wordmark" onClick={()=>go('explore')}><img className="brand-logo" src={asset('/images/backed-logo.svg')} alt="Backed" /></button><p>Creators deserve a direct<br/>line to the people who back them.</p><button className="back-top" onClick={()=>window.scrollTo({top:0,behavior:'smooth'})}>Back to top <ArrowUpRight size={15}/></button></div><p className="footer-support">{contactEmail?<>Customer support: <a href={`mailto:${contactEmail}`}>{contactEmail}</a></>:null}</p><div className="footer-bottom"><span>© {new Date().getFullYear()} Backed</span><div><a href="#/about">About</a><button onClick={startSelling}>Start selling</button><a href="#/help">Help</a><a href="#/terms">Terms</a><a href="#/privacy">Privacy</a><a href="#/refunds">Refunds</a></div><span className="footer-location">Built for creators everywhere</span></div></footer>
  {toast&&<div className="toast" role="status"><span className="toast-dot"/>{toast}<button onClick={()=>setToast('')} aria-label="Dismiss notification"><X size={15}/></button></div>}
 </div></ArtistNav.Provider>
}
function ReleaseSection({title,subtitle,releases,onOpen,onBuy,onSeeAll,icon,id}:{title:string;subtitle:string;releases:Release[];onOpen:(r:Release)=>void;onBuy:(r:Release)=>void;onSeeAll?:()=>void;icon?:React.ReactNode;id?:string}){return <section className="release-section" id={id}><div className="section-head"><div><h2>{title}</h2><p>{subtitle}</p></div>{onSeeAll&&<button className="text-link see-all" onClick={onSeeAll}>View all <ArrowRight size={16}/></button>}</div>{releases.length?<div className="release-grid">{releases.map(r=><ReleaseCard key={r.id} release={r} onOpen={onOpen} onBuy={onBuy}/>)}</div>:<div className="section-empty">No releases in this collection yet.</div>}</section>}
function ReleaseCard({release:r,onOpen,onBuy}:{release:Release;onOpen:(r:Release)=>void;onBuy:(r:Release)=>void}){const toArtist=useContext(ArtistNav);return <article className="release-card"><button className="release-art" onClick={()=>onOpen(r)} aria-label={`View ${r.title}`}><img src={r.image} alt={`${r.title} cover artwork`} loading="lazy"/>{r.tag&&<span className="release-tag">{r.tag}</span>}<span className="art-open"><ArrowUpRight size={19}/></span></button><div className="release-card-info"><button className="release-title" onClick={()=>onOpen(r)}>{r.title}</button><button className="release-artist" onClick={()=>r.artistId?toArtist(r.artistId):onOpen(r)}>{r.artist}</button><div className="release-card-bottom"><span>{r.type}</span><b>{priceLabel(r)}</b></div><button className="quick-buy" onClick={()=>onBuy(r)}>Get release <ArrowUpRight size={14}/></button></div></article>}
function Empty({title,text,action,actionLabel}:{title:string;text:string;action?:()=>void;actionLabel?:string}){return <div className="empty-state"><div className="empty-icon"><Music2 size={22}/></div><h3>{title}</h3><p>{text}</p>{action&&<button className="btn btn-outline" onClick={action}>{actionLabel||'Continue'} <ArrowRight size={16}/></button>}</div>}
function Metric({icon,label,value,note}:{icon:React.ReactNode;label:string;value:string;note:string}){return <div className="metric-card"><div className="metric-top"><span className="metric-icon">{icon}</span><span className="metric-note">DEMO</span></div><span className="metric-label">{label}</span><strong>{value}</strong><span className="metric-foot">{note}</span></div>}

createRoot(document.getElementById('root')!).render(<React.StrictMode>{new URLSearchParams(window.location.search).has('guest') ? <GuestOrderPage /> : <App />}</React.StrictMode>)
