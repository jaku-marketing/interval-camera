export function openPhotoStore(name = 'interval-camera-v1') {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('photos', { keyPath: 'id' });
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('他のタブを閉じてから、再読み込みしてください。'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      const transact = (mode, operation) => new Promise((done, fail) => {
        const tx = db.transaction('photos', mode);
        const req = operation(tx.objectStore('photos'));
        tx.oncomplete = () => done(req.result);
        tx.onerror = () => fail(tx.error || req.error || new Error('保存処理に失敗しました。'));
        tx.onabort = () => fail(tx.error || new Error('保存処理が中断されました。'));
      });
      resolve({
        close: () => db.close(),
        all: () => transact('readonly', store => store.getAll()),
        put: item => transact('readwrite', store => store.put(item)),
        remove: id => transact('readwrite', store => store.delete(id))
      });
    };
  });
}
