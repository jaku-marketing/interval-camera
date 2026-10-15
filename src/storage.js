// Safari may close an IndexedDB connection while the page or camera is suspended.
// Keep the stored photos, discard only the connection, and retry idempotent work once.
export async function openPhotoStore(name = 'interval-camera-v1', { factory = globalThis.indexedDB } = {}) {
  let db = null, opening = null, closed = false;
  const closedError = () => new DOMException('保存領域への接続は終了しています。', 'InvalidStateError');
  const connectionError = error => ['InvalidStateError', 'UnknownError', 'AbortError'].includes(error?.name);

  function discard(connection) {
    if (db === connection) db = null;
    connection?.close();
  }

  function connect() {
    if (closed) return Promise.reject(closedError());
    if (db) return Promise.resolve(db);
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      let settled = false;
      const fail = error => { settled = true; reject(error); };
      const request = factory.open(name, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('photos')) {
          request.result.createObjectStore('photos', { keyPath: 'id' });
        }
      };
      request.onerror = () => fail(request.error);
      request.onblocked = () => fail(new Error('他のタブを閉じてから、再読み込みしてください。'));
      request.onsuccess = () => {
        const connection = request.result;
        // A blocked request can still finish after rejection. Do not leak that connection.
        if (settled || closed) { connection.close(); fail(closedError()); return; }
        connection.onclose = () => { if (db === connection) db = null; };
        connection.onversionchange = () => discard(connection);
        db = connection;
        settled = true;
        resolve(connection);
      };
    }).finally(() => { opening = null; });
    return opening;
  }

  function run(connection, mode, operation) {
    return new Promise((resolve, reject) => {
      // transaction() itself throws when close is pending, even without a close event.
      const tx = connection.transaction('photos', mode);
      let request;
      tx.oncomplete = () => resolve(request.result);
      // Wait for abort, not the earlier request error, before reconnecting or retrying.
      tx.onabort = () => reject(tx.error || request?.error || new DOMException('保存処理が中断されました。', 'AbortError'));
      try { request = operation(tx.objectStore('photos')); }
      catch (error) { tx.onabort = () => reject(error); tx.abort(); }
    });
  }

  async function transact(mode, operation) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let connection;
      try {
        connection = await connect();
        if (closed) throw closedError();
        return await run(connection, mode, operation);
      } catch (error) {
        if (closed || !connectionError(error)) throw error;
        discard(connection);
        if (attempt === 1) {
          throw new Error('写真の保存領域に接続できませんでした。このページを再読み込みして、もう一度お試しください。', { cause: error });
        }
        // Allow the browser's storage process to recover; reuse the same JPEG and id.
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  // Exercise a real transaction on startup, so a successful open is not mistaken for readiness.
  await transact('readonly', store => store.count());
  return {
    close() { closed = true; discard(db); },
    all: () => transact('readonly', store => store.getAll()),
    put: item => transact('readwrite', store => store.put(item)),
    remove: id => transact('readwrite', store => store.delete(id))
  };
}
