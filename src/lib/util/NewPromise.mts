export class NewPromise {
    static withResolvers<T>(): { promise: Promise<T>, resolve: (value: T | PromiseLike<T>) => any, reject: (value: T | PromiseLike<T>) => any } {
        let resolve: (value: T | PromiseLike<T>) => any = () => void 0;
        let reject: (value: T | PromiseLike<T>) => any = () => void 0;
        let promise = new Promise<T>((_resolve, _reject) => {
            resolve = _resolve;
            reject = _reject;
        });
        return {
            promise,
            resolve,
            reject
        }
    }

    static map<T, K, IterableT extends Iterable<T>>(iterable: IterableT, fn: (value: T, index: number, iterable: IterableT) => K | PromiseLike<K>): Promise<K[]> {
        const values = Array.from(iterable);
        const results: K[] = new Array(values.length);
        let completed = 0;

        return new Promise((resolve, reject) => {
            // if no element , return empty array
            if (values.length === 0) {
                resolve(results);
                return;
            }

            // handle each element
            values.forEach((value, index) => {
                try {
                    const result: (K | PromiseLike<K>) = fn(value, index, iterable);

                    // @ts-ignore
                    if (typeof result?.then === 'function') {
                        // @ts-ignore
                        result.then(
                            (resolvedValue: K) => handleResult(index, resolvedValue),
                            (error: any) => reject(error)
                        );
                    } else {
                        // @ts-ignore;; non-promise
                        handleResult(index, result);
                    }
                } catch (error) {
                    // reject sync error
                    reject(error);
                }
            });

            function handleResult(index: number, value: K) {
                results[index] = value;
                completed++;

                if (completed === values.length) {
                    resolve(results);
                }
            }
        });
    }
}