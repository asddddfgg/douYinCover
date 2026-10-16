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
const ECL_STATE={text:{...ECL_DEFAULT},selected:{A:'effect-gradient',B:'effect-neon'}};
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
function eclSetText(group,value,source){
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