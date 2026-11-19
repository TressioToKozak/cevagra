"""Bounded reusable Node workers. No database connection is held while waiting."""
import atexit
from concurrent.futures import Future, TimeoutError as FutureTimeout
import json
import os
from pathlib import Path
import queue
import selectors
import subprocess
from threading import Lock, Thread
import time

ROOT = Path(__file__).resolve().parent


class VerificationUnavailable(Exception):
    pass


class InvalidTrace(Exception):
    pass


def default_workers():
    count = os.cpu_count() or 2
    try:
        quota, period = Path('/sys/fs/cgroup/cpu.max').read_text().split()
        if quota != 'max':
            count = min(count, max(1, int(quota)//int(period)))
    except (OSError, ValueError):
        pass
    configured = os.environ.get('VERIFIER_WORKERS')
    if configured:
        count = int(configured)
        if not 1 <= count <= 4:
            raise ValueError('VERIFIER_WORKERS must be between 1 and 4')
    return max(1, min(4, count))


class VerifierPool:
    def __init__(self, workers=None, capacity=128):
        self.jobs = queue.Queue(maxsize=capacity)
        self.closed = False
        self.processes = set()
        self.lock = Lock()
        self.threads = [Thread(target=self._run, name=f'game-verifier-{i}', daemon=True) for i in range(workers or default_workers())]
        for thread in self.threads:
            thread.start()

    def call(self, data):
        if self.closed:
            raise VerificationUnavailable()
        future = Future()
        deadline = time.monotonic()+7
        try:
            self.jobs.put_nowait((future, data, deadline))
            return future.result(timeout=8)
        except (queue.Full, FutureTimeout):
            future.cancel()
            raise VerificationUnavailable() from None

    def _spawn(self):
        proc = subprocess.Popen(['node', str(ROOT/'game-verifier.mjs'), '--server'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=0)
        with self.lock:
            self.processes.add(proc)
        return proc

    def _stop(self, proc):
        with self.lock:
            self.processes.discard(proc)
        if proc.poll() is None:
            proc.kill()
        proc.wait(timeout=2)
        proc.stdin.close()
        proc.stdout.close()

    def _exchange(self, proc, data, deadline):
        payload = (json.dumps(data, separators=(',', ':'))+'\n').encode()
        if len(payload) > 1_000_000:
            raise InvalidTrace()
        # A selector covers both directions, including a stopped worker's full pipe.
        os.set_blocking(proc.stdin.fileno(), False)
        os.set_blocking(proc.stdout.fileno(), False)
        with selectors.DefaultSelector() as selector:
            selector.register(proc.stdin, selectors.EVENT_WRITE)
            selector.register(proc.stdout, selectors.EVENT_READ)
            sent = 0
            output = bytearray()
            while time.monotonic() < deadline:
                for key, _ in selector.select(max(0, deadline-time.monotonic())):
                    if key.fileobj is proc.stdin:
                        try:
                            sent += os.write(proc.stdin.fileno(), payload[sent:])
                        except BlockingIOError:
                            continue
                        if sent == len(payload):
                            selector.unregister(proc.stdin)
                    else:
                        try:
                            chunk = os.read(proc.stdout.fileno(), 65536)
                        except BlockingIOError:
                            continue
                        if not chunk:
                            raise VerificationUnavailable()
                        output.extend(chunk)
                        if len(output) > 2_000_000:
                            raise VerificationUnavailable()
                        if output.endswith(b'\n'):
                            response = json.loads(output)
                            if not isinstance(response, dict):
                                raise VerificationUnavailable()
                            if response.get('ok') is True:
                                return response['value']
                            raise InvalidTrace()
        raise VerificationUnavailable()

    def _run(self):
        proc = None
        try:
            while True:
                job = self.jobs.get()
                if job is None:
                    return
                future, data, deadline = job
                if not future.set_running_or_notify_cancel():
                    continue
                if deadline <= time.monotonic():
                    future.set_exception(VerificationUnavailable())
                    continue
                try:
                    if proc is None or proc.poll() is not None:
                        if proc:
                            self._stop(proc)
                        proc = self._spawn()
                    value = self._exchange(proc, data, deadline)
                    if not future.done():
                        future.set_result(value)
                except InvalidTrace as error:
                    if not future.done():
                        future.set_exception(error)
                except (OSError, ValueError, VerificationUnavailable):
                    if proc:
                        self._stop(proc)
                        proc = None
                    if not future.done():
                        future.set_exception(VerificationUnavailable())
        finally:
            if proc:
                self._stop(proc)

    def close(self):
        if self.closed:
            return
        self.closed = True
        with self.lock:
            for proc in self.processes:
                if proc.poll() is None:
                    proc.kill()
        while True:
            try:
                job = self.jobs.get_nowait()
                if job and not job[0].done():
                    job[0].set_exception(VerificationUnavailable())
            except queue.Empty:
                break
        for _ in self.threads:
            self.jobs.put_nowait(None)
        for thread in self.threads:
            thread.join(timeout=2)


_pool = None
_pool_lock = Lock()


def verify(data):
    global _pool
    with _pool_lock:
        if _pool is None:
            _pool = VerifierPool()
    return _pool.call(data)


def close():
    global _pool
    with _pool_lock:
        pool, _pool = _pool, None
    if pool:
        pool.close()


atexit.register(close)
