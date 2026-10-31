'use strict';
(function(root){
  function shuffled(values,rng){const list=[...values];for(let i=list.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[list[i],list[j]]=[list[j],list[i]];}return list;}
  class ExamTrainer{
    constructor(bank,count=10,rng=Math.random){this.questions=shuffled(bank.filter(q=>!q.ambiguous&&q.options.some(o=>o.correct)),rng).slice(0,count).map(q=>({...q,options:shuffled(q.options,rng)}));this.index=0;this.answers=[];this.selected=[];this.checked=false;this.finished=this.questions.length===0;}
    get current(){return this.questions[this.index];}
    pick(index){if(this.checked||this.finished)return;const multiple=this.current.options.filter(o=>o.correct).length>1;if(multiple)this.selected=this.selected.includes(index)?this.selected.filter(i=>i!==index):[...this.selected,index];else this.selected=[index];}
    check(){if(this.checked||this.finished||!this.selected.length)return null;const expected=this.current.options.map((o,i)=>o.correct?i:-1).filter(i=>i>=0);const correct=expected.length===this.selected.length&&expected.every(i=>this.selected.includes(i));const result={number:this.current.number,correct,selected:[...this.selected],expected};this.answers.push(result);this.checked=true;return result;}
    next(){if(!this.checked||this.finished)return false;if(this.index+1===this.questions.length){this.finished=true;return true;}this.index++;this.checked=false;this.selected=[];return true;}
    get score(){return this.answers.filter(a=>a.correct).length;}
    get mistakes(){return this.questions.filter(q=>this.answers.some(a=>a.number===q.number&&!a.correct));}
  }
  root.ExamTrainer=ExamTrainer;
})(typeof window==='undefined'?globalThis:window);
