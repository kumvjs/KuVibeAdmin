type CacheKey<T> = string & {
  __type?: T
}
