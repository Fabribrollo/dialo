self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const candidate=event.notification.data?.url;
 const url=typeof candidate==='string'&&candidate.startsWith('/')&&!candidate.startsWith('//')&&!/[\\\u0000-\u0020]/.test(candidate)?candidate:'/';
 event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{const existing=windows.find(w=>new URL(w.url).origin===self.location.origin);if(existing){await existing.focus();existing.postMessage({type:'dialo:open-notification',url});}else await clients.openWindow(url);}));
});
