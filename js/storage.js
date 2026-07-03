const INDEX='rechnung3.documents.index';const key=id=>`rechnung3.document.${id}`;
export function listDocuments(){return JSON.parse(localStorage.getItem(INDEX)||'[]').sort((a,b)=>String(b.updatedAt).localeCompare(a.updatedAt));}
function writeIndex(items){localStorage.setItem(INDEX,JSON.stringify(items));}
export function saveDocument(doc){localStorage.setItem(key(doc.id),JSON.stringify(doc));const items=listDocuments().filter(x=>x.id!==doc.id);items.unshift({id:doc.id,title:doc.title,updatedAt:doc.updatedAt,schemaVersion:doc.schemaVersion});writeIndex(items);}
export function loadDocument(id){const raw=localStorage.getItem(key(id));return raw?JSON.parse(raw):null;}
export function deleteDocument(id){localStorage.removeItem(key(id));writeIndex(listDocuments().filter(x=>x.id!==id));}
