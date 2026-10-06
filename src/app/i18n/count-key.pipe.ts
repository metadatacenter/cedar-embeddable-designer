import { Pipe, PipeTransform } from '@angular/core';
import { countKey } from './messages';

/**
 * The key of a counted message's form for `count`, for the `translate` pipe to render:
 * `{{ 'common.errorCount' | countKey: count | translate: { count } }}`.
 */
@Pipe({ name: 'countKey' })
export class CountKeyPipe implements PipeTransform {
  transform(key: string, count: number): string {
    return countKey(key, count);
  }
}
