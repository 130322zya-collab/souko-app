
import { useState, useEffect } from "react";
import { supabase } from "./supabase";

// ── マスタ ──
const SC = ['#2563eb','#16a34a','#d97706','#9333ea','#e11d48','#0891b2'];
const MCAT_A = ['構造材','羽柄材・造作材','面材・ボード','断熱材','SE金物','副資材・消耗品'];
const TCAT = ['電動工具','手工具','測定・墨出し','仮設・養生','その他'];

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const nowStr = () => {
  const d = new Date();
  return `${today()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};
const fmt = s => { if(!s) return ''; const [,m,d] = s.split('-'); return `${+m}月${+d}日`; };
const daysBetween = (from, to) => Math.floor((new Date(to) - new Date(from)) / 86400000);

// ── スタイル ──
const AC = '#c2410c';
const S = {
  card: {background:'#fff',border:'0.5px solid #e2e8f0',borderRadius:16,padding:16,marginBottom:12,boxShadow:'0 1px 4px rgba(0,0,0,0.05)'},
  input: {width:'100%',background:'#f8fafc',border:'1.5px solid #e2e8f0',borderRadius:10,padding:'10px 12px',fontSize:14,color:'#1e293b',fontFamily:'inherit',outline:'none',WebkitAppearance:'none',boxSizing:'border-box'},
  btnPrimary: {background:'linear-gradient(135deg,#9a3412,#c2410c)',color:'#fff',border:'none',borderRadius:10,padding:'10px 16px',fontSize:14,fontWeight:600,cursor:'pointer',width:'100%'},
  btnSm: {background:'#fff',border:'1.5px solid #e2e8f0',borderRadius:10,padding:'7px 14px',fontSize:12,fontWeight:600,cursor:'pointer'},
  btnDanger: {background:'#fef2f2',color:'#dc2626',border:'1.5px solid #fecaca',borderRadius:10,padding:'7px 14px',fontSize:12,fontWeight:600,cursor:'pointer'},
  label: {fontSize:11,color:'#94a3b8',fontWeight:700,letterSpacing:'0.08em',marginBottom:6,display:'block'},
  sectionTitle: {fontSize:15,fontWeight:700,marginBottom:12,color:'#1e293b'},
};

const Badge = ({children, type='blue'}) => {
  const styles = {
    red:{background:'#fef2f2',color:'#dc2626'},
    amber:{background:'#fffbeb',color:'#d97706'},
    green:{background:'#f0fdf4',color:'#16a34a'},
    blue:{background:'#eff6ff',color:'#2563eb'},
    orange:{background:'#fff7ed',color:'#c2410c'},
    gray:{background:'#f1f5f9',color:'#64748b'},
  };
  return <span style={{display:'inline-flex',alignItems:'center',padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700,...(styles[type]||styles.blue)}}>{children}</span>;
};

const Chip = ({active, color=AC, onClick, children}) => (
  <button onClick={onClick}
    style={{padding:'6px 14px',borderRadius:20,border:'1.5px solid',borderColor:active?color:'#e2e8f0',background:active?color:'#f8fafc',color:active?'#fff':'#64748b',fontSize:12,fontWeight:600,cursor:'pointer'}}>
    {children}
  </button>
);

export default function App() {
  const [tab, setTab] = useState('home');
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState([]);
  const [members, setMembers] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [tools, setTools] = useState([]);
  const [ntfs, setNtfs] = useState([]);

  // 倉庫A
  const [mcat, setMcat] = useState('all');
  const [mForm, setMForm] = useState(null);
  const [mAdd, setMAdd] = useState(false);
  const [nm, setNm] = useState({name:'',category:MCAT_A[0],customCat:'',qty:'',unit:'枚',min:'',loc:''});
  // 倉庫B
  const [bview, setBview] = useState('tool');
  const [tflt, setTflt] = useState('all');
  const [tForm, setTForm] = useState(null);
  const [tAdd, setTAdd] = useState(false);
  const [nt, setNt] = useState({name:'',no:'',category:TCAT[0],checkDue:''});
  const [tSearch, setTSearch] = useState('');
  const [tViewMode, setTViewMode] = useState('list'); // 'list' | 'group'
  const [groupOpen, setGroupOpen] = useState(null);
  // 設定
  const [nsName, setNsName] = useState('');
  const [newMem, setNewMem] = useState('');

  const gs = id => sites.find(s => s.id == id);
  const firstMem = () => members[0]?.name || '';
  const dberr = (e) => { console.error(e); alert('保存に失敗しました。電波状況を確認してもう一度お試しください'); };

  // ── データ読み込み（全員共通のデータベースから取得） ──
  const fetchAll = async () => {
    const [s, m, mat, t, n] = await Promise.all([
      supabase.from('sites').select('*').order('id'),
      supabase.from('members').select('*').order('id'),
      supabase.from('materials').select('*').order('id'),
      supabase.from('tools').select('*').order('id'),
      supabase.from('ntfs').select('*').order('id', {ascending:false}).limit(100),
    ]);
    if(s.error || m.error || mat.error || t.error || n.error){
      alert('データの読み込みに失敗しました。通信環境を確認してください');
      return;
    }
    setSites(s.data); setMembers(m.data); setMaterials(mat.data);
    setTools(t.data); setNtfs(n.data);
    setLoading(false);
  };
  useEffect(() => { fetchAll(); }, []);

  const notify = async (body, type) => {
    const { data, error } = await supabase.from('ntfs').insert({dt: nowStr(), type, body}).select().single();
    if(!error && data) setNtfs(p => [data, ...p]);
  };

  // ── 在庫品の入出庫（倉庫A・B共通） ──
  const execMat = async () => {
    const m = materials.find(x => x.id === mForm.id);
    const n = parseInt(mForm.qty);
    if(!n || n <= 0) return alert('数量を入力してください');
    if(mForm.mode === 'out'){
      if(!mForm.siteId) return alert('出庫先の現場を選択してください');
      if(n > m.qty) return alert(`在庫が足りません（現在 ${m.qty}${m.unit}）`);
      const newQty = m.qty - n;
      const { data, error } = await supabase.from('materials').update({qty:newQty}).eq('id', m.id).select().single();
      if(error) return dberr(error);
      setMaterials(p => p.map(x => x.id === m.id ? data : x));
      const s = gs(mForm.siteId);
      await notify(`${mForm.member} が ${m.name} ×${n}${m.unit} を出庫（${s?.name}／倉庫${m.wh}）`, 'out');
      if(newQty < m.min_qty) await notify(`【在庫不足】${m.name} が残り ${newQty}${m.unit}（発注点 ${m.min_qty}${m.unit}）`, 'low');
    } else {
      const { data, error } = await supabase.from('materials').update({qty:m.qty + n}).eq('id', m.id).select().single();
      if(error) return dberr(error);
      setMaterials(p => p.map(x => x.id === m.id ? data : x));
      await notify(`${m.name} ×${n}${m.unit} を入庫（倉庫${m.wh}）`, 'in');
    }
    setMForm(null);
  };

  const addMat = async () => {
    if(!nm.name.trim()) return alert('品名は必須です');
    const wh = mAdd;
    let category = wh==='B' ? '金物' : nm.category;
    if(wh==='A' && nm.category==='__new__'){
      if(!nm.customCat.trim()) return alert('新しい分類名を入力してください');
      category = nm.customCat.trim();
    }
    const { data, error } = await supabase.from('materials').insert({
      wh, name:nm.name.trim(), category,
      qty: parseInt(nm.qty)||0, unit: nm.unit||'個', min_qty: parseInt(nm.min)||0, loc: nm.loc.trim()
    }).select().single();
    if(error) return dberr(error);
    setMaterials(p => [...p, data]);
    setNm({name:'',category:MCAT_A[0],customCat:'',qty:'',unit:'枚',min:'',loc:''});
    setMAdd(false);
  };

  const delMat = async (m) => {
    if(!window.confirm(`「${m.name}」を削除しますか？\n全員の画面から消えます。`)) return;
    const { error } = await supabase.from('materials').delete().eq('id', m.id);
    if(error) return dberr(error);
    setMaterials(p => p.filter(x => x.id !== m.id));
    await notify(`${m.name} を品目から削除`, 'del');
  };

  // ── 道具の持出・返却 ──
  const execOut = async () => {
    const t = tools.find(x => x.id === tForm.id);
    if(!tForm.siteId) return alert('現場を選択してください');
    const { data, error } = await supabase.from('tools').update({
      status:'持出中', site_id: parseInt(tForm.siteId), member: tForm.member, out_date: today()
    }).eq('id', t.id).select().single();
    if(error) return dberr(error);
    setTools(p => p.map(x => x.id === t.id ? data : x));
    const s = gs(tForm.siteId);
    await notify(`${tForm.member} が ${t.name} を持出（${s?.name}）`, 'out');
    setTForm(null);
  };

  const execBack = async (id) => {
    const t = tools.find(x => x.id === id);
    const s = gs(t.site_id);
    const { data, error } = await supabase.from('tools').update({
      status:'倉庫', site_id: null, member:'', out_date: null
    }).eq('id', id).select().single();
    if(error) return dberr(error);
    setTools(p => p.map(x => x.id === id ? data : x));
    await notify(`${t.member} が ${t.name} を返却（${s?.name || ''}）`, 'back');
  };

  const addTool = async () => {
    if(!nt.name.trim()) return alert('道具名は必須です');
    const { data, error } = await supabase.from('tools').insert({
      name: nt.name.trim(), mgmt_no: nt.no.trim(), category: nt.category, status:'倉庫',
      check_due: nt.checkDue || null
    }).select().single();
    if(error) return dberr(error);
    setTools(p => [...p, data]);
    setNt({name:'',no:'',category:TCAT[0],checkDue:''});
    setTAdd(false);
  };

  const delTool = async (t) => {
    if(!window.confirm(`「${t.name}」を削除しますか？\n全員の画面から消えます。`)) return;
    const { error } = await supabase.from('tools').delete().eq('id', t.id);
    if(error) return dberr(error);
    setTools(p => p.filter(x => x.id !== t.id));
    await notify(`${t.name} を道具リストから削除`, 'del');
  };

  // ── 集計 ──
  const lowMats = materials.filter(m => m.qty < m.min_qty);
  const outTools = tools.filter(t => t.status === '持出中');
  const longOut = outTools.filter(t => daysBetween(t.out_date, today()) >= 7);
  const dueTools = tools.filter(t => t.check_due && daysBetween(today(), t.check_due) <= 30);

  // ── 在庫品カード（共通） ──
  const matCard = (m) => {
    const low = m.qty < m.min_qty;
    const opened = mForm && mForm.id === m.id;
    return (
      <div key={m.id} style={{...S.card, ...(low?{borderColor:'#fecaca',background:'#fff9f9'}:{})}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
          <div style={{flex:1}}>
            <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:5}}>
              <Badge type="gray">{m.category}</Badge>
              {m.loc && <Badge type="blue">置場 {m.loc}</Badge>}
              {low && <Badge type="red">在庫不足</Badge>}
            </div>
            <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>{m.name}</div>
          </div>
          <div style={{textAlign:'right',marginLeft:8}}>
            <div style={{fontSize:24,fontWeight:800,color:low?'#dc2626':'#1e293b',lineHeight:1}}>{m.qty}<span style={{fontSize:12,fontWeight:600,color:'#94a3b8'}}> {m.unit}</span></div>
            <div style={{fontSize:10,color:'#94a3b8',marginTop:3}}>発注点 {m.min_qty}{m.unit}</div>
          </div>
        </div>

        {!opened ? (
          <div style={{display:'flex',gap:6,marginTop:10,paddingTop:10,borderTop:'0.5px solid #f1f5f9'}}>
            <button style={{...S.btnSm,flex:1,color:'#16a34a',borderColor:'#bbf7d0'}} onClick={()=>setMForm({id:m.id,mode:'in',qty:'',siteId:'',member:firstMem()})}>＋ 入庫</button>
            <button style={{...S.btnSm,flex:1,color:'#c2410c',borderColor:'#fdba74'}} onClick={()=>setMForm({id:m.id,mode:'out',qty:'',siteId:'',member:firstMem()})}>− 出庫</button>
            <button style={{...S.btnSm,color:'#dc2626',borderColor:'#fecaca'}} onClick={()=>delMat(m)}>削除</button>
          </div>
        ) : (
          <div style={{marginTop:10,paddingTop:10,borderTop:'0.5px solid #f1f5f9'}}>
            <div style={{fontSize:12,fontWeight:700,color:mForm.mode==='in'?'#16a34a':'#c2410c',marginBottom:8}}>{mForm.mode==='in'?'入庫する':'出庫する'}</div>
            <div style={{display:'grid',gridTemplateColumns:mForm.mode==='out'?'1fr 1fr':'1fr',gap:8,marginBottom:8}}>
              <input type="number" min="1" style={S.input} placeholder={`数量（${m.unit}）`} value={mForm.qty} onChange={e=>setMForm(f=>({...f,qty:e.target.value}))}/>
              {mForm.mode==='out' && (
                <select style={S.input} value={mForm.member} onChange={e=>setMForm(f=>({...f,member:e.target.value}))}>
                  {members.map(x=><option key={x.id} value={x.name}>{x.name}</option>)}
                </select>
              )}
            </div>
            {mForm.mode==='out' && (
              <select style={{...S.input,marginBottom:8}} value={mForm.siteId} onChange={e=>setMForm(f=>({...f,siteId:e.target.value}))}>
                <option value="">出庫先の現場を選択</option>
                {sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <div style={{display:'flex',gap:8}}>
              <button style={{...S.btnSm,flex:1}} onClick={()=>setMForm(null)}>キャンセル</button>
              <button style={{...S.btnPrimary,flex:2}} onClick={execMat}>確定</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── 在庫品 登録フォーム（共通） ──
  const matAddForm = (wh) => {
    // 過去に登録された品名を候補として出す（入力を楽にする）
    const nameOptions = [...new Set(materials.filter(m => m.wh===wh).map(m => m.name))];
    // 分類の候補＝初期リスト＋実際にDBにある分類（自由追加した分がここに増えていく）
    const catOptions = [...new Set([...MCAT_A, ...materials.filter(m => m.wh==='A').map(m => m.category)])];
    return (
    <div style={{...S.card,borderColor:'#fdba74'}}>
      <div style={S.sectionTitle}>{wh==='A'?'材料を登録（倉庫A）':'金物を登録（倉庫B）'}</div>
      <div style={{marginBottom:10}}>
        <label style={S.label}>品名</label>
        <input style={S.input} list={`matNames-${wh}`} placeholder={wh==='A'?'例：構造用合板 24mm 3×6':'例：羽子板ボルト'} value={nm.name} onChange={e=>setNm(f=>({...f,name:e.target.value}))}/>
        <datalist id={`matNames-${wh}`}>
          {nameOptions.map(n=><option key={n} value={n}/>)}
        </datalist>
        {nameOptions.length>0 && <div style={{fontSize:10,color:'#94a3b8',marginTop:4}}>入力欄をタップすると過去の品名候補が出ます</div>}
      </div>
      {wh==='A' && (
        <div style={{marginBottom:10}}>
          <label style={S.label}>分類</label>
          <select style={S.input} value={nm.category} onChange={e=>setNm(f=>({...f,category:e.target.value}))}>
            {catOptions.map(c=><option key={c}>{c}</option>)}
            <option value="__new__">＋ 新しい分類を追加</option>
          </select>
          {nm.category==='__new__' && (
            <input style={{...S.input,marginTop:8}} placeholder="新しい分類名を入力" value={nm.customCat} onChange={e=>setNm(f=>({...f,customCat:e.target.value}))}/>
          )}
        </div>
      )}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:10}}>
        <div><label style={S.label}>現在数量</label><input type="number" style={S.input} value={nm.qty} onChange={e=>setNm(f=>({...f,qty:e.target.value}))}/></div>
        <div><label style={S.label}>単位</label><input style={S.input} placeholder="枚・本・箱" value={nm.unit} onChange={e=>setNm(f=>({...f,unit:e.target.value}))}/></div>
        <div><label style={S.label}>発注点</label><input type="number" style={S.input} value={nm.min} onChange={e=>setNm(f=>({...f,min:e.target.value}))}/></div>
      </div>
      <div style={{marginBottom:12}}><label style={S.label}>置き場所</label><input style={S.input} placeholder={wh==='A'?'例：A-1':'例：B-1'} value={nm.loc} onChange={e=>setNm(f=>({...f,loc:e.target.value}))}/></div>
      <div style={{display:'flex',gap:8}}>
        <button style={{...S.btnSm,flex:1}} onClick={()=>setMAdd(false)}>キャンセル</button>
        <button style={{...S.btnPrimary,flex:2}} onClick={addMat}>登録する</button>
      </div>
    </div>
    );
  };

  // ── ホーム ──
  const renderHome = () => (
    <div>
      <div style={{...S.card,background:'linear-gradient(135deg,#7c2d12,#c2410c)',border:'none',color:'#fff'}}>
        <div style={{fontSize:12,opacity:0.8,marginBottom:8}}>倉庫サマリー</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
          <div style={{textAlign:'center'}}>
            <div style={{fontSize:28,fontWeight:800,color:'#fca5a5'}}>{lowMats.length}</div>
            <div style={{fontSize:10,opacity:0.8,marginTop:2}}>在庫不足</div>
          </div>
          <div style={{textAlign:'center'}}>
            <div style={{fontSize:28,fontWeight:800,color:'#fcd34d'}}>{outTools.length}</div>
            <div style={{fontSize:10,opacity:0.8,marginTop:2}}>道具 持出中</div>
          </div>
          <div style={{textAlign:'center'}}>
            <div style={{fontSize:28,fontWeight:800,color:'#fdba74'}}>{dueTools.length}</div>
            <div style={{fontSize:10,opacity:0.8,marginTop:2}}>点検期限接近</div>
          </div>
        </div>
      </div>

      {lowMats.length > 0 && (
        <div style={{...S.card,borderColor:'#fecaca',background:'#fff9f9'}}>
          <div style={{fontSize:13,fontWeight:700,color:'#dc2626',marginBottom:10}}>在庫不足（発注点を下回り）</div>
          {lowMats.map(m => (
            <div key={m.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 0',borderBottom:'0.5px solid #fecaca',fontSize:13}}>
              <span style={{fontWeight:700,color:'#991b1b'}}><Badge type="gray">倉庫{m.wh}</Badge> {m.name}</span>
              <span style={{color:'#dc2626',flexShrink:0,marginLeft:8}}>残 {m.qty}{m.unit}（発注点 {m.min_qty}）</span>
            </div>
          ))}
        </div>
      )}

      {longOut.length > 0 && (
        <div style={{...S.card,borderColor:'#fde68a',background:'#fffdf5'}}>
          <div style={{fontSize:13,fontWeight:700,color:'#d97706',marginBottom:10}}>長期持出（7日以上）</div>
          {longOut.map(t => (
            <div key={t.id} style={{padding:'7px 0',borderBottom:'0.5px solid #fde68a',fontSize:13}}>
              <div style={{fontWeight:700,color:'#92400e'}}>{t.name}</div>
              <div style={{fontSize:11,color:'#d97706',marginTop:2}}>{t.member} / {gs(t.site_id)?.name} / {daysBetween(t.out_date, today())}日経過</div>
            </div>
          ))}
        </div>
      )}

      {dueTools.length > 0 && (
        <div style={S.card}>
          <div style={{fontSize:13,fontWeight:700,color:'#c2410c',marginBottom:10}}>点検・校正期限（30日以内）</div>
          {dueTools.map(t => (
            <div key={t.id} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'0.5px solid #f1f5f9',fontSize:13}}>
              <span style={{fontWeight:700}}>{t.name}</span>
              <span style={{color:'#c2410c'}}>{fmt(t.check_due)} まで</span>
            </div>
          ))}
        </div>
      )}

      <div style={S.card}>
        <div style={S.sectionTitle}>現場別 持出道具</div>
        {sites.map(s => {
          const ts = outTools.filter(t => t.site_id === s.id);
          return (
            <div key={s.id} style={{padding:'10px 0',borderBottom:'0.5px solid #f1f5f9'}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                <div style={{width:9,height:9,borderRadius:'50%',background:s.color}}/>
                <span style={{fontSize:14,fontWeight:600,flex:1}}>{s.name}</span>
                <Badge type={ts.length?'orange':'gray'}>{ts.length}点</Badge>
              </div>
              {ts.length > 0 && <div style={{fontSize:12,color:'#64748b',paddingLeft:17}}>{ts.map(t=>t.name).join('・')}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── 倉庫A（材料・建材・SE金物） ──
  const renderWhA = () => {
    const catList = [...new Set([...MCAT_A, ...materials.filter(m => m.wh==='A').map(m => m.category)])];
    const list = materials.filter(m => m.wh==='A' && (mcat==='all' || m.category===mcat));
    return (
      <div>
        <div style={{...S.card,padding:'12px 14px'}}>
          <div style={{fontSize:12,fontWeight:700,color:'#94a3b8',marginBottom:8}}>倉庫A：材料・建材・SE金物</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
            <Chip active={mcat==='all'} onClick={()=>setMcat('all')}>すべて</Chip>
            {catList.map(c => <Chip key={c} active={mcat===c} onClick={()=>setMcat(c)}>{c}</Chip>)}
          </div>
        </div>

        {mAdd==='A' ? matAddForm('A') : (
          <button style={{...S.btnPrimary,marginBottom:12}} onClick={()=>setMAdd('A')}>＋ 材料を登録する</button>
        )}

        {list.map(matCard)}
      </div>
    );
  };

  // ── 道具カード（一覧表示・グループ展開の両方で使う） ──
  const toolCard = (t) => {
    const out = t.status === '持出中';
    const d = out ? daysBetween(t.out_date, today()) : 0;
    const due = t.check_due && daysBetween(today(), t.check_due) <= 30;
    const opened = tForm && tForm.id === t.id;
    return (
      <div key={t.id} style={S.card}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
          <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
            <Badge type={out?'amber':'green'}>{t.status}</Badge>
            {t.mgmt_no && <Badge type="gray">{t.mgmt_no}</Badge>}
            {out && d >= 7 && <Badge type="red">{d}日経過</Badge>}
            {due && <Badge type="orange">点検 {fmt(t.check_due)}まで</Badge>}
          </div>
        </div>
        <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>{t.name}</div>
        <div style={{fontSize:11,color:'#94a3b8',marginTop:2}}>{t.category}</div>
        {out && (
          <div style={{fontSize:12,color:'#64748b',marginTop:6,background:'#fffbeb',borderRadius:8,padding:'7px 10px'}}>
            {gs(t.site_id)?.name} / {t.member} / {fmt(t.out_date)}持出
          </div>
        )}

        {!opened ? (
          <div style={{display:'flex',gap:6,marginTop:10,paddingTop:10,borderTop:'0.5px solid #f1f5f9'}}>
            {out
              ? <button style={{...S.btnSm,flex:1,color:'#16a34a',borderColor:'#bbf7d0'}} onClick={()=>execBack(t.id)}>返却する</button>
              : <button style={{...S.btnSm,flex:1,color:'#c2410c',borderColor:'#fdba74'}} onClick={()=>setTForm({id:t.id,member:firstMem(),siteId:''})}>持ち出す</button>}
            {!out && (
              <button style={{...S.btnSm,color:'#dc2626',borderColor:'#fecaca'}} onClick={()=>delTool(t)}>削除</button>
            )}
          </div>
        ) : (
          <div style={{marginTop:10,paddingTop:10,borderTop:'0.5px solid #f1f5f9'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
              <select style={S.input} value={tForm.member} onChange={e=>setTForm(f=>({...f,member:e.target.value}))}>
                {members.map(x=><option key={x.id} value={x.name}>{x.name}</option>)}
              </select>
              <select style={S.input} value={tForm.siteId} onChange={e=>setTForm(f=>({...f,siteId:e.target.value}))}>
                <option value="">現場を選択</option>
                {sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button style={{...S.btnSm,flex:1}} onClick={()=>setTForm(null)}>キャンセル</button>
              <button style={{...S.btnPrimary,flex:2}} onClick={execOut}>持出を記録</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── 道具を名前ごとにまとめたグループ表示 ──
  const renderToolGroups = (searched) => {
    const groups = {};
    searched.forEach(t => {
      if(!groups[t.name]) groups[t.name] = [];
      groups[t.name].push(t);
    });
    const names = Object.keys(groups).sort();
    if(!names.length) return <div style={{textAlign:'center',padding:32,color:'#94a3b8',fontSize:14}}>該当する道具がありません</div>;
    return names.map(name => {
      const items = groups[name];
      const outCount = items.filter(t => t.status==='持出中').length;
      const isOpen = groupOpen === name;
      return (
        <div key={name} style={S.card}>
          <div onClick={()=>setGroupOpen(isOpen?null:name)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer'}}>
            <div>
              <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>{name}</div>
              <div style={{fontSize:11,color:'#94a3b8',marginTop:2}}>{items[0].category}</div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <Badge type={outCount>0?'amber':'green'}>持出 {outCount}／計{items.length}台</Badge>
              <span style={{fontSize:12,color:'#94a3b8'}}>{isOpen?'閉じる':'内訳'}</span>
            </div>
          </div>
          {isOpen && (
            <div style={{marginTop:12,paddingTop:12,borderTop:'0.5px solid #f1f5f9',display:'flex',flexDirection:'column',gap:10}}>
              {items.map(t => toolCard(t))}
            </div>
          )}
        </div>
      );
    });
  };

  // ── 倉庫B（道具・金物） ──
  const renderWhB = () => {
    const kanas = materials.filter(m => m.wh==='B');
    const q = tSearch.trim().toLowerCase();
    const searched = tools.filter(t =>
      (tflt==='all' || t.status===tflt) &&
      (!q || t.name.toLowerCase().includes(q) || (t.mgmt_no||'').toLowerCase().includes(q))
    );
    return (
      <div>
        <div style={{...S.card,padding:'12px 14px'}}>
          <div style={{fontSize:12,fontWeight:700,color:'#94a3b8',marginBottom:8}}>倉庫B：道具・金物</div>
          <div style={{display:'flex',gap:6,marginBottom:bview==='tool'?8:0}}>
            <Chip active={bview==='tool'} onClick={()=>setBview('tool')}>道具（{tools.length}）</Chip>
            <Chip active={bview==='kana'} onClick={()=>setBview('kana')}>金物（{kanas.length}）</Chip>
          </div>
          {bview==='tool' && (
            <>
              <input style={{...S.input,marginBottom:8}} placeholder="道具名・管理番号で検索" value={tSearch} onChange={e=>setTSearch(e.target.value)}/>
              <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:8}}>
                {['all','倉庫','持出中'].map(f => <Chip key={f} active={tflt===f} onClick={()=>setTflt(f)}>{f==='all'?'すべて':f}</Chip>)}
              </div>
              <div style={{display:'flex',gap:6}}>
                <Chip active={tViewMode==='list'} color="#2563eb" onClick={()=>setTViewMode('list')}>一覧表示</Chip>
                <Chip active={tViewMode==='group'} color="#2563eb" onClick={()=>setTViewMode('group')}>名前別に管理</Chip>
              </div>
            </>
          )}
        </div>

        {bview==='kana' ? (
          <div>
            {mAdd==='B' ? matAddForm('B') : (
              <button style={{...S.btnPrimary,marginBottom:12}} onClick={()=>setMAdd('B')}>＋ 金物を登録する</button>
            )}
            {kanas.map(matCard)}
          </div>
        ) : (
          <div>
            {!tAdd ? (
              <button style={{...S.btnPrimary,marginBottom:12}} onClick={()=>setTAdd(true)}>＋ 道具を登録する</button>
            ) : (
              <div style={{...S.card,borderColor:'#fdba74'}}>
                <div style={S.sectionTitle}>道具を登録</div>
                <div style={{marginBottom:10}}><label style={S.label}>道具名</label><input style={S.input} placeholder="例：インパクトドライバー" value={nt.name} onChange={e=>setNt(f=>({...f,name:e.target.value}))}/></div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}}>
                  <div><label style={S.label}>管理番号</label><input style={S.input} placeholder="例：D-06" value={nt.no} onChange={e=>setNt(f=>({...f,no:e.target.value}))}/></div>
                  <div><label style={S.label}>分類</label>
                    <select style={S.input} value={nt.category} onChange={e=>setNt(f=>({...f,category:e.target.value}))}>
                      {TCAT.map(c=><option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{marginBottom:12}}><label style={S.label}>点検・校正期限（任意）</label><input type="date" style={S.input} value={nt.checkDue} onChange={e=>setNt(f=>({...f,checkDue:e.target.value}))}/></div>
                <div style={{display:'flex',gap:8}}>
                  <button style={{...S.btnSm,flex:1}} onClick={()=>setTAdd(false)}>キャンセル</button>
                  <button style={{...S.btnPrimary,flex:2}} onClick={addTool}>登録する</button>
                </div>
              </div>
            )}

            {tViewMode==='group'
              ? renderToolGroups(searched)
              : (searched.length
                  ? searched.map(t => toolCard(t))
                  : <div style={{textAlign:'center',padding:32,color:'#94a3b8',fontSize:14}}>該当する道具がありません</div>)
            }
          </div>
        )}
      </div>
    );
  };

  // ── 持出中 ──
  const renderOut = () => {
    const list = [...outTools].sort((a,b)=>(a.out_date||'').localeCompare(b.out_date||''));
    return (
      <div>
        <div style={S.card}>
          <div style={S.sectionTitle}>持出中の道具（{list.length}点）</div>
          {!list.length && <div style={{textAlign:'center',padding:32,color:'#94a3b8',fontSize:14}}>持出中の道具はありません</div>}
          {list.map(t => {
            const d = daysBetween(t.out_date, today());
            return (
              <div key={t.id} style={{padding:'10px 0',borderBottom:'0.5px solid #f1f5f9'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:14,fontWeight:700}}>{t.name}</span>
                  <Badge type={d>=7?'red':'gray'}>{d}日</Badge>
                </div>
                <div style={{fontSize:12,color:'#64748b',marginTop:3}}>{gs(t.site_id)?.name} / {t.member} / {fmt(t.out_date)}〜</div>
                <button style={{...S.btnSm,marginTop:6,color:'#16a34a',borderColor:'#bbf7d0'}} onClick={()=>execBack(t.id)}>返却する</button>
              </div>
            );
          })}
        </div>
        <div style={{fontSize:11,color:'#94a3b8',textAlign:'center',padding:'0 16px'}}>7日以上返却がない道具は赤く表示されます</div>
      </div>
    );
  };

  // ── 通知 ──
  const renderNtf = () => {
    const col = {out:'#c2410c', in:'#16a34a', back:'#2563eb', low:'#dc2626', del:'#64748b'};
    const lbl = {out:'持出/出庫', in:'入庫', back:'返却', low:'在庫不足', del:'削除'};
    return (
      <div>
        <div style={S.card}>
          <div style={S.sectionTitle}>通知・動きの記録（全員共通）</div>
          {!ntfs.length && <div style={{textAlign:'center',padding:32,color:'#94a3b8',fontSize:14}}>まだ記録がありません</div>}
          {ntfs.map(n => (
            <div key={n.id} style={{display:'flex',gap:10,padding:'10px 0',borderBottom:'0.5px solid #f1f5f9'}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:col[n.type]||'#94a3b8',marginTop:5,flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:13,color:'#1e293b'}}>{n.body}</div>
                <div style={{fontSize:11,color:'#94a3b8',marginTop:2}}>{n.dt} ・ {lbl[n.type]||''}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{fontSize:11,color:'#94a3b8',padding:'0 16px',lineHeight:1.6}}>
          ※他の人の操作は、ヘッダーの「更新」を押すと最新の状態に反映されます。
        </div>
      </div>
    );
  };

  // ── 設定 ──
  const renderCfg = () => (
    <div>
      <div style={S.card}>
        <div style={S.sectionTitle}>現場を追加</div>
        <div style={{display:'flex',gap:8}}>
          <input style={{...S.input,flex:1}} placeholder="現場名" value={nsName} onChange={e=>setNsName(e.target.value)}/>
          <button style={{...S.btnSm,background:'linear-gradient(135deg,#9a3412,#c2410c)',color:'#fff',border:'none'}} onClick={async ()=>{
            if(!nsName.trim()) return;
            const { data, error } = await supabase.from('sites').insert({name:nsName.trim(),color:SC[sites.length%SC.length]}).select().single();
            if(error) return dberr(error);
            setSites(p=>[...p,data]); setNsName('');
          }}>追加</button>
        </div>
      </div>

      {sites.map(s=>(
        <div key={s.id} style={S.card}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:14,height:14,borderRadius:'50%',background:s.color}}/>
            <div style={{flex:1}}>
              <div style={{fontSize:15,fontWeight:700}}>{s.name}</div>
              <div style={{fontSize:12,color:'#94a3b8'}}>持出中 {outTools.filter(t=>t.site_id===s.id).length}点</div>
            </div>
            <button style={S.btnDanger} onClick={async ()=>{
              if(!window.confirm(`「${s.name}」を削除しますか？\n全員の画面から消えます。`)) return;
              const { error } = await supabase.from('sites').delete().eq('id', s.id);
              if(error) return dberr(error);
              setSites(p=>p.filter(x=>x.id!==s.id));
            }}>削除</button>
          </div>
        </div>
      ))}

      <div style={S.card}>
        <div style={S.sectionTitle}>メンバー管理</div>
        <div style={{display:'flex',gap:8,marginBottom:12}}>
          <input style={{...S.input,flex:1}} placeholder="メンバー名を追加" value={newMem} onChange={e=>setNewMem(e.target.value)}/>
          <button style={{...S.btnSm,background:'linear-gradient(135deg,#9a3412,#c2410c)',color:'#fff',border:'none'}} onClick={async ()=>{
            const name = newMem.trim();
            if(!name || members.some(m=>m.name===name)) return;
            const { data, error } = await supabase.from('members').insert({name}).select().single();
            if(error) return dberr(error);
            setMembers(p=>[...p,data]); setNewMem('');
          }}>追加</button>
        </div>
        <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
          {members.map(m=>(
            <div key={m.id} style={{display:'flex',alignItems:'center',gap:4,background:'#f8fafc',border:'1.5px solid #e2e8f0',borderRadius:20,padding:'5px 10px 5px 14px'}}>
              <span style={{fontSize:13,fontWeight:600}}>{m.name}</span>
              <button onClick={async ()=>{
                if(!window.confirm(`「${m.name}」をメンバーから外しますか？`)) return;
                const { error } = await supabase.from('members').delete().eq('id', m.id);
                if(error) return dberr(error);
                setMembers(p=>p.filter(x=>x.id!==m.id));
              }}
                style={{background:'none',border:'none',cursor:'pointer',color:'#94a3b8',fontSize:16,padding:'0 0 0 6px',lineHeight:1}}>✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const tabs = [
    {id:'home',icon:'🏠',label:'ホーム'},
    {id:'whA',icon:'🪵',label:'倉庫A'},
    {id:'whB',icon:'🔧',label:'倉庫B'},
    {id:'out',icon:'🚚',label:'持出中'},
    {id:'ntf',icon:'🔔',label:'通知'},
    {id:'cfg',icon:'⚙️',label:'設定'},
  ];

  if(loading) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#f5f2ee',fontFamily:'-apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",sans-serif'}}>
      <div style={{textAlign:'center',color:'#94a3b8'}}>
        <div style={{fontSize:32,marginBottom:10}}>🏭</div>
        <div style={{fontSize:14,fontWeight:600}}>倉庫データを読み込み中…</div>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:'100vh',background:'#f5f2ee',fontFamily:'-apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",sans-serif'}}>
      {/* ヘッダー */}
      <div style={{background:'linear-gradient(135deg,#7c2d12,#c2410c)',padding:'14px 16px',display:'flex',alignItems:'center',gap:12,position:'sticky',top:0,zIndex:50}}>
        <div style={{width:38,height:38,background:'rgba(255,255,255,0.2)',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>🏭</div>
        <div style={{flex:1}}>
          <div style={{fontSize:17,fontWeight:800,color:'#fff'}}>倉庫管理</div>
          <div style={{fontSize:11,color:'rgba(255,255,255,0.7)'}}>A：材料・SE金物 ／ B：道具・金物</div>
        </div>
        {(lowMats.length>0 || longOut.length>0) && (
          <div style={{background:'#fff',color:'#c2410c',borderRadius:20,padding:'4px 10px',fontSize:11,fontWeight:800}}>要対応 {lowMats.length+longOut.length}</div>
        )}
        <button onClick={fetchAll} style={{background:'rgba(255,255,255,0.2)',border:'none',color:'#fff',borderRadius:10,padding:'8px 12px',fontSize:12,fontWeight:700,cursor:'pointer'}}>↻ 更新</button>
      </div>

      {/* コンテンツ */}
      <div style={{maxWidth:600,margin:'0 auto',padding:'12px 12px 88px'}}>
        {tab==='home' && renderHome()}
        {tab==='whA' && renderWhA()}
        {tab==='whB' && renderWhB()}
        {tab==='out' && renderOut()}
        {tab==='ntf' && renderNtf()}
        {tab==='cfg' && renderCfg()}
      </div>

      {/* タブバー */}
      <div style={{position:'fixed',bottom:0,left:0,right:0,background:'#fff',borderTop:'1px solid #e2e8f0',display:'flex',zIndex:100,boxShadow:'0 -2px 12px rgba(0,0,0,0.06)'}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{flex:1,padding:'10px 0 8px',background:'none',border:'none',cursor:'pointer',fontSize:9,color:tab===t.id?'#c2410c':'#94a3b8',display:'flex',flexDirection:'column',alignItems:'center',gap:2,fontWeight:tab===t.id?700:400,fontFamily:'inherit'}}>
            <span style={{fontSize:20,lineHeight:1}}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
