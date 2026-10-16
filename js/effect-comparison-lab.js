/* 特效对比实验室 - 第02至05阶段
 * 独立命名空间 ECL / ecl-*；不修改主画布 state、渲染、图层或存储。
 * A 文本只同步 A 的20个副本；B 文本只同步 B 的20个副本。
 * A/B 的特效选择状态分开保存、分开渲染。
 */
(function () {
'use strict';
const ECL_EFFECTS = [
['effect-gradient','双色渐变'],['effect-neon','霓虹发光'],['effect-3d','3D立体'],['effect-cyber','赛博机甲'],
['effect-glitch','故障艺术'],['effect-hk','复古港风'],['effect-gold','暗金奢华'],['effect-fire','烈火熔岩'],
['effect-ice','寒冰霜冻'],['effect-black-stroke','黑描边粗重'],['effect-purple-mist','紫雾迷幻'],['effect-sunset','日落晚霞'],
['effect-deep-sea','深海湛蓝'],['effect-jade','翡翠绿光'],['effect-candy','梦幻糖果'],['effect-metal','重金属风'],
['effect-chalk','粉笔手绘'],['effect-lightning','闪电高压'],['effect-red-stroke','红描边爆款'],['effect-viral','王牌爆款']
].map(([id,name])=>({id,name}));
const ECL_DEFAULT={A:'好大一棵树，绿色的祝福',B:'贾宝玉买了铅笔'};
const ECL_STATE={
 text:{...ECL_DEFAULT},selected:{A:'effect-gradient',B:'effect-neon'},
 background:{type:'gradient',color1:'#ff2442',color2:'#2575fc',imageUrl:''},
 finalGroup:'A',confirmed:null
};
const ECL_PLAN_KEY='ecl_saved_plans_v1';
function eclCreate(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;}
function eclBuildUI(){
 const root=document.getElementById('ecl-lab-root');if(!root||root.dataset.ready==='true')return;root.dataset.ready='true';
 const actions=document.querySelector('.app-header .actions');
 if(actions&&!document.getElementById('ecl-open-btn')){
  const btn=eclCreate('button','btn','特效对比实验室');btn.id='ecl-open-btn';btn.type='button';btn.title='滚动到下方特效对比实验室';
  btn.prepend(eclCreate('i','fa-solid fa-flask'));btn.addEventListener('click',()=>root.scrollIntoView({behavior:'smooth',block:'start'}));actions.insertBefore(btn,actions.firstChild);
 }
 const shell=eclCreate('div','ecl-shell'),panel=eclCreate('section','ecl-panel'),header=eclCreate('div','ecl-panel-head'),titleWrap=eclCreate('div');
 const title=eclCreate('h2','','特效对比实验室');title.prepend(eclCreate('i','fa-solid fa-flask'));
 titleWrap.append(title,eclCreate('p','','同页编辑 · 9:16 画布比例 · A/B 文本分别同步 · 两组特效互不影响'));
 const headActions=eclCreate('div','ecl-head-actions');
 [['恢复 A 默认文字',()=>eclSetText('A',ECL_DEFAULT.A)],['恢复 B 默认文字',()=>eclSetText('B',ECL_DEFAULT.B)]].forEach(([label,fn])=>{const b=eclCreate('button','ecl-btn',label);b.type='button';b.addEventListener('click',fn);headActions.appendChild(b);});
 header.append(titleWrap,headActions);panel.appendChild(header);
 panel.append(eclBuildGroup('A','文本 A · 20 种特效副本','编辑 A 文本，只同步 A 组的 20 个副本。'));
 panel.append(eclBuildGroup('B','文本 B · 20 种特效副本','编辑 B 文本，只同步 B 组的 20 个副本。'));
 panel.appendChild(eclCreate('div','ecl-note','A、B 两组分别选中特效。修改文字只同步同组文字，不会改动另一组文字或特效选中状态。本阶段不会将实验室内容写入主画布。'));
 shell.appendChild(panel);root.appendChild(shell);
}
function eclBuildGroup(group,heading,description){
 const section=eclCreate('section','ecl-group');section.dataset.group=group;
 const toolbar=eclCreate('div','ecl-toolbar'),label=eclCreate('label','','统一编辑 '+group+' 文本'),input=eclCreate('input','ecl-text-input');
 input.id='ecl-input-'+group;label.htmlFor=input.id;input.type='text';input.maxLength=300;input.value=ECL_STATE.text[group];input.placeholder='输入 '+group+' 文本';
 input.addEventListener('input',()=>eclSetText(group,input.value,input));
 toolbar.append(label,input,eclCreate('span','ecl-count','20 个可编辑副本'));
 const sectionLabel=eclCreate('div','ecl-section-label');sectionLabel.append(eclCreate('strong','',heading),eclCreate('div','',description));
 const grid=eclCreate('div','ecl-grid');grid.id='ecl-grid-'+group;
 ECL_EFFECTS.forEach((effect,index)=>{
  const card=eclCreate('article','ecl-card'+(effect.id===ECL_STATE.selected[group]?' ecl-selected':''));card.dataset.group=group;card.dataset.effectId=effect.id;card.tabIndex=0;
  card.setAttribute('aria-label',group+'组候选 '+(index+1)+'：'+effect.name);
  const cardHead=eclCreate('div','ecl-card-head');cardHead.append(eclCreate('strong','',String(index+1).padStart(2,'0')+' · '+effect.name),eclCreate('small','',group));
  const preview=eclCreate('div','ecl-preview'),text=eclCreate('div','ecl-preview-text '+effect.id,ECL_STATE.text[group]);
  text.contentEditable='true';text.spellcheck=false;text.setAttribute('role','textbox');text.setAttribute('aria-label',group+'组'+effect.name+'文字编辑区');
  text.addEventListener('input',()=>eclSetText(group,text.innerText,text));text.addEventListener('click',e=>e.stopPropagation());preview.appendChild(text);
  const foot=eclCreate('div','ecl-card-foot'),indicator=eclCreate('span','ecl-select-indicator',effect.id===ECL_STATE.selected[group]?'✓ 已选中':'点击选择');
  indicator.dataset.eclIndicator='true';foot.append(eclCreate('span','','可编辑'),indicator);card.append(cardHead,preview,foot);
  card.addEventListener('click',()=>eclSelect(group,effect.id));
  card.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target===card){e.preventDefault();eclSelect(group,effect.id);}});
  grid.appendChild(card);
 });
 section.append(toolbar,sectionLabel,grid);return section;
}

function eclBuildBackgroundAndPlan(){
 const wrap=eclCreate('section','ecl-final-area');
 const bgTitle=eclCreate('h3','ecl-final-title','06 · 背景选择与最终方案管理');
 const bgHelp=eclCreate('p','ecl-final-help','背景只作用于实验室候选预览；选择 A 或 B 作为最终方案后，先确认，再保存或应用。');
 const bgRow=eclCreate('div','ecl-bg-controls');
 const typeLabel=eclCreate('label','','背景类型');
 const type=eclCreate('select','ecl-bg-type');
 [['gradient','双色渐变'],['solid','纯色背景'],['image','自定义图片']].forEach(([v,t])=>{const o=eclCreate('option','',t);o.value=v;type.appendChild(o);});
 const c1Label=eclCreate('label','','颜色 1'),c1=eclCreate('input','ecl-bg-color');c1.type='color';c1.value=ECL_STATE.background.color1;
 const c2Label=eclCreate('label','','颜色 2'),c2=eclCreate('input','ecl-bg-color');c2.type='color';c2.value=ECL_STATE.background.color2;
 const imageLabel=eclCreate('label','','背景图片'),image=eclCreate('input','ecl-bg-file');image.type='file';image.accept='image/*';
 const bgHint=eclCreate('span','ecl-bg-hint','图片仅用于实验室预览；保存方案会保存图片数据。');
 type.value=ECL_STATE.background.type;
 type.addEventListener('change',()=>{ECL_STATE.background.type=type.value;eclInvalidateConfirmation('背景已修改，请重新确认方案');eclRenderPreviewBackgrounds();});
 c1.addEventListener('input',()=>{ECL_STATE.background.color1=c1.value;eclInvalidateConfirmation('背景已修改，请重新确认方案');eclRenderPreviewBackgrounds();});
 c2.addEventListener('input',()=>{ECL_STATE.background.color2=c2.value;eclInvalidateConfirmation('背景已修改，请重新确认方案');eclRenderPreviewBackgrounds();});
 image.addEventListener('change',()=>{const file=image.files&&image.files[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{ECL_STATE.background.imageUrl=String(reader.result||'');ECL_STATE.background.type='image';type.value='image';eclInvalidateConfirmation('背景已修改，请重新确认方案');eclRenderPreviewBackgrounds();};reader.readAsDataURL(file);});
 bgRow.append(typeLabel,type,c1Label,c1,c2Label,c2,imageLabel,image,bgHint);
 const planTitle=eclCreate('h3','ecl-final-title','最终方案');
 const planRow=eclCreate('div','ecl-plan-controls');
 const groupLabel=eclCreate('label','','使用哪组文字与特效');
 const groupSelect=eclCreate('select','ecl-final-group');
 [['A','文本 A'],['B','文本 B']].forEach(([v,t])=>{const o=eclCreate('option','',t);o.value=v;groupSelect.appendChild(o);});
 groupSelect.addEventListener('change',()=>{ECL_STATE.finalGroup=groupSelect.value;eclInvalidateConfirmation('最终方案组已修改，请重新确认');});
 const confirm=eclCreate('button','ecl-btn ecl-btn-primary','确认方案');confirm.type='button';confirm.addEventListener('click',eclConfirmPlan);
 const save=eclCreate('button','ecl-btn','保存已确认方案');save.type='button';save.addEventListener('click',eclSavePlan);
 const apply=eclCreate('button','ecl-btn ecl-btn-danger','应用到主画布');apply.type='button';apply.addEventListener('click',eclApplyPlan);
 planRow.append(groupLabel,groupSelect,confirm,save,apply);
 const status=eclCreate('p','ecl-plan-status','尚未确认方案。候选方案不会自动覆盖主画布。');status.id='ecl-plan-status';
 const savedTitle=eclCreate('h4','ecl-saved-title','已保存方案');
 const saved=eclCreate('div','ecl-saved-plans');saved.id='ecl-saved-plans';
 wrap.append(bgTitle,bgHelp,bgRow,planTitle,planRow,status,savedTitle,saved);return wrap;
}
function eclInvalidateConfirmation(message){
 ECL_STATE.confirmed=null;
 const status=document.getElementById('ecl-plan-status');
 if(status)status.textContent=message+'。请点击“确认方案”后再保存或应用。';
}
function eclRenderPreviewBackgrounds(){
 document.querySelectorAll('.ecl-preview').forEach(el=>{
  const bg=ECL_STATE.background;
  if(bg.type==='solid')el.style.background=bg.color1;
  else if(bg.type==='image'&&bg.imageUrl){el.style.backgroundImage='url("'+bg.imageUrl+'")';el.style.backgroundSize='cover';el.style.backgroundPosition='center';}
  else el.style.background='linear-gradient(135deg,'+bg.color1+' 0%,'+bg.color2+' 100%)';
 });
}
function eclBuildSnapshot(){
 const group=ECL_STATE.finalGroup,effect=ECL_EFFECTS.find(x=>x.id===ECL_STATE.selected[group]);
 return {id:'ecl-plan-'+Date.now(),group,text:ECL_STATE.text[group],effectId:ECL_STATE.selected[group],effectName:effect?effect.name:ECL_STATE.selected[group],background:JSON.parse(JSON.stringify(ECL_STATE.background)),confirmedAt:new Date().toISOString()};
}
function eclConfirmPlan(){
 ECL_STATE.confirmed=eclBuildSnapshot();
 const status=document.getElementById('ecl-plan-status');
 if(status)status.textContent='已确认：文本 '+ECL_STATE.confirmed.group+' · '+ECL_STATE.confirmed.effectName+'。确认快照已锁定；后续修改需重新确认。';
}
function eclLoadPlans(){try{const data=JSON.parse(localStorage.getItem(ECL_PLAN_KEY)||'[]');return Array.isArray(data)?data:[];}catch(e){return [];}}
function eclSavePlan(){
 if(!ECL_STATE.confirmed){alert('请先点击“确认方案”，再保存。');return;}
 const plans=eclLoadPlans();plans.unshift(JSON.parse(JSON.stringify(ECL_STATE.confirmed)));
 try{localStorage.setItem(ECL_PLAN_KEY,JSON.stringify(plans.slice(0,30)));eclRenderSavedPlans();const status=document.getElementById('ecl-plan-status');if(status)status.textContent='已保存方案：'+ECL_STATE.confirmed.effectName+'（最多保留最近 30 个）。';}
 catch(e){alert('保存失败：浏览器本地存储空间可能不足，特别是背景图片较大时。');}
}
function eclRenderSavedPlans(){
 const root=document.getElementById('ecl-saved-plans');if(!root)return;root.innerHTML='';
 const plans=eclLoadPlans();
 if(!plans.length){root.appendChild(eclCreate('p','ecl-bg-hint','暂无保存方案。确认后点击“保存已确认方案”。'));return;}
 plans.forEach((plan,index)=>{
  const item=eclCreate('div','ecl-saved-plan');
  const info=eclCreate('div','ecl-saved-plan-info',new Date(plan.confirmedAt||Date.now()).toLocaleString()+' · '+(plan.group||'A')+'组 · '+(plan.effectName||plan.effectId||'特效'));
  const preview=eclCreate('span','ecl-saved-plan-text',(plan.text||'').slice(0,28));
  const load=eclCreate('button','ecl-btn','载入');load.type='button';load.addEventListener('click',()=>eclLoadPlan(plan));
  const del=eclCreate('button','ecl-btn','删除');del.type='button';del.addEventListener('click',()=>{const now=eclLoadPlans();now.splice(index,1);localStorage.setItem(ECL_PLAN_KEY,JSON.stringify(now));eclRenderSavedPlans();});
  item.append(info,preview,load,del);root.appendChild(item);
 });
}
function eclLoadPlan(plan){
 if(!plan||!plan.background||!plan.group)return;
 ECL_STATE.text[plan.group]=String(plan.text||'');ECL_STATE.selected[plan.group]=plan.effectId||ECL_STATE.selected[plan.group];
 ECL_STATE.finalGroup=plan.group;ECL_STATE.background=JSON.parse(JSON.stringify(plan.background));
 const input=document.getElementById('ecl-input-'+plan.group);if(input)input.value=ECL_STATE.text[plan.group];
 document.querySelectorAll('#ecl-grid-'+plan.group+' .ecl-preview-text').forEach(el=>el.innerText=ECL_STATE.text[plan.group]);
 eclSelect(plan.group,ECL_STATE.selected[plan.group]);
 const selector=document.querySelector('.ecl-final-group');if(selector)selector.value=plan.group;
 const type=document.querySelector('.ecl-bg-type');if(type)type.value=ECL_STATE.background.type;
 const colors=document.querySelectorAll('.ecl-bg-color');if(colors[0])colors[0].value=ECL_STATE.background.color1||'#ff2442';if(colors[1])colors[1].value=ECL_STATE.background.color2||'#2575fc';
 eclRenderPreviewBackgrounds();ECL_STATE.confirmed=JSON.parse(JSON.stringify(plan));
 const status=document.getElementById('ecl-plan-status');if(status)status.textContent='已载入并恢复已确认方案：'+(plan.effectName||plan.effectId)+'。可直接应用，或修改后重新确认。';
}
function eclEscapeHTML(value){return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function eclApplyPlan(){
 const plan=ECL_STATE.confirmed;
 if(!plan){alert('请先点击“确认方案”。候选内容不会自动覆盖主画布。');return;}
 if(typeof state==='undefined'||!state||typeof state.getCurrentPage!=='function'){alert('主画布尚未初始化，请刷新网页后重试。');return;}
 const target=state.getSelectedLayer();
 const effectExists=ECL_EFFECTS.some(x=>x.id===plan.effectId);
 const ok=confirm('即将把已确认的「文本 '+plan.group+' · '+plan.effectName+'」应用到主画布。\n\n若当前选中的是文本图层：只替换该图层文字和特效，保留字号、字体、颜色、位置、尺寸等样式。\n若未选中文本图层：新增一个文本图层。\n背景将应用到所有分页。其他图层不会删除。\n\n确定继续吗？');
 if(!ok)return;
 if(target&&target.type==='text'){
  target.content=eclEscapeHTML(plan.text);target.effectClass=effectExists?plan.effectId:'effect-black-stroke';
 }else{
  const current=state.getCurrentPage();
  const id='ecl-text-'+Date.now();
  state.addLayer({id,type:'text',content:eclEscapeHTML(plan.text),fontSize:'32px',fontFamily:'sans-serif',color:'#ffffff',bgColor:'transparent',bold:true,italic:false,underline:false,strike:false,align:'center',vertical:false,letterSpacing:0,lineHeight:1.2,opacity:1,effectClass:effectExists?plan.effectId:'effect-black-stroke',x:30,y:160,width:300,height:120});
 }
 state.background={type:plan.background.type||'gradient',color1:plan.background.color1||'#ff2442',color2:plan.background.color2||'#2575fc',imageUrl:plan.background.imageUrl||''};
 if(typeof renderAll==='function')renderAll();else{if(typeof renderCanvas==='function')renderCanvas();if(typeof renderLayerList==='function')renderLayerList();}
 const status=document.getElementById('ecl-plan-status');if(status)status.textContent='已应用到主画布。其他图层与当前文字图层原有样式已保留；如需撤销，请使用主项目现有操作或重新调整。';
}
\nfunction eclSetText(group,value,source){
 ECL_STATE.text[group]=value;const input=document.getElementById('ecl-input-'+group);
 if(input&&input!==source&&input.value!==value)input.value=value;
 document.querySelectorAll('#ecl-grid-'+group+' .ecl-preview-text').forEach(el=>{if(el!==source&&el.innerText!==value)el.innerText=value;});
}
function eclSelect(group,effectId){
 ECL_STATE.selected[group]=effectId;
 document.querySelectorAll('#ecl-grid-'+group+' .ecl-card').forEach(card=>{
  const selected=card.dataset.effectId===effectId;card.classList.toggle('ecl-selected',selected);
  const indicator=card.querySelector('[data-ecl-indicator]');if(indicator)indicator.textContent=selected?'✓ 已选中':'点击选择';
 });
}
document.addEventListener('DOMContentLoaded',eclBuildUI);
})();