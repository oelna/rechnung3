export const selection={pageId:null,frameId:null,cell:null};
export const selectPage=id=>{selection.pageId=id;selection.frameId=null;selection.cell=null};
export const selectFrame=(pageId,frameId)=>{selection.pageId=pageId;selection.frameId=frameId;selection.cell=null};
export const selectCell=(frameId,row,col)=>{selection.frameId=frameId;selection.cell={frameId,row,col};};
export function selectedPage(doc){return doc.pages.find(p=>p.id===selection.pageId)||doc.pages[0];}
export function selectedFrame(doc){for(const p of doc.pages){const f=p.frames.find(x=>x.id===selection.frameId);if(f)return f;}return null;}
