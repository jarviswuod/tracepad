import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { beforeEach } from 'vitest'

beforeEach(() => {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem('tracepad.boardSort')
  localStorage.removeItem('tracepad.boardCustomBase')
})