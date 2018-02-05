import {snapAction, makeCallSnapper} from '../src/snapAction'
import { MockPromise } from '../src/mockPromise'
import timetable from '../src/timetable'
import snapshot from '../src/snapshot'
import config from '../src/config'


describe('snapAction', () => {
  describe('makeCallSnapper', () => {
    const snapshot = {}
    let callSnapper, cb, payload

    beforeEach(() => {
      snapshot.add = jest.fn()
      cb = jest.fn()
      payload = {isPayload: true}
      callSnapper = makeCallSnapper(snapshot, 'type', cb)
    })

    it('Calls passed callback with name and payload', () => {
      const name = 'name'
      callSnapper(name, payload)
      expect(cb).toBeCalledWith(name, payload)
    })

    it('Produces message that matches snapshot', () => {
      callSnapper('name', payload)
      expect(snapshot.add.mock.calls[0]).toMatchSnapshot()
    })
  })

  describe('core', () => {
    const mocks = {}
    const options = {}
    let action

    beforeEach(() => {
      timetable.reset()

      mocks.state = {
        isState: true
      }
      mocks.getters = {
        value: [1, 2, 3]
      }
      mocks.commit = jest.fn()
      mocks.dispatch = jest.fn()
      mocks.payload = {isPayload: true}

      Object.assign(options, config.options)

      action = jest.fn(({commit, dispatch}, payload) => {
        commit('a', payload)
        dispatch('a', payload)
      })
    })
    
    it('Passes mocks', () => {
      snapAction(action, mocks, [], {})

      const recivedMocks = action.mock.calls[0][0]
      const recivedPayload = action.mock.calls[0][1]

      expect(recivedMocks.state).toBe(mocks.state)
      expect(recivedMocks.getters).toBe(mocks.getters)
      expect(recivedPayload).toBe(mocks.payload)

      expect(mocks.commit).toBeCalledWith('a', mocks.payload)
      expect(mocks.dispatch).toBeCalledWith('a', mocks.payload)
    })

    it('Always ends with action resolution message for async actions', done => {
      const actionResolve = () => new Promise((resolve) => {
        new MockPromise('will.resolve').then(resolve)
      })
      const actionReject = () => new Promise((resolve, reject) => {
        new MockPromise('will.reject').catch(reject)
      })
      const actionIdle = () => {
        new MockPromise('will.resolve')
        return new Promise(() => {})
      }

      const resolveSnapPromise = snapAction(actionResolve, mocks, ['will.resolve'], options)
      const rejectSnapPromise = snapAction(actionReject, mocks, [
        {name: 'will.reject', type: 'reject'}
      ], options)
      const idleSnapPromise = snapAction(actionIdle, mocks, ['will.resolve'], options)

      resolveSnapPromise.then(run => {
        expect(run[run.length - 1].message).toBe('ACTION RESOLVED')
      })

      rejectSnapPromise.then(run => {
        expect(run[run.length - 1].message).toBe('ACTION REJECTED')
      })

      idleSnapPromise.then(run => {
        expect(run[run.length - 1].message).toBe('ACTION DID NOT RESOLVE')
      })

      Promise.all([
        resolveSnapPromise,
        rejectSnapPromise,
        idleSnapPromise,
      ])
        .then(() => {
          done()
        })
        .catch(done)
    })

    it('Waits additional tick for async action to resolve', done => {
      const action = () => new Promise(resolve => {
        const promises = [new MockPromise(() => {})]
        Promise.all(promises).then(resolve)
      })

      snapAction(action, mocks, ['Promise'], options)
        .then(run => {
          expect(run[run.length - 1].message).toBe('ACTION RESOLVED')
          done()
        })
        .catch(done)
    })
    
    it('Snaps info about ENV when snapEnv is ture', () => {
      options.snapEnv = true
      const run = snapAction(action, mocks, [], options)

      expect(run[0].message).toBe('DATA MOCKS')
      expect(run[0].payload.state).toBe(mocks.state)
      expect(run[0].payload.getters).toBe(mocks.getters)

      expect(run[1].message).toBe('ACTION CALL')
      expect(run[1].payload).toBe(mocks.payload)
    })

    it('Pipes errors up and returns run as far as it happend', done => {
      const action = () => new Promise(resolve => {
        const promises = [new MockPromise(() => {})]
        Promise.all(promises).then(resolve)
      })

      const normalizeErrorPromise = new MockPromise(() => {})
      const timetableErrorPromise = new MockPromise(() => {})

      snapAction(action, mocks, [{type: 'strange thing'}], options)
        .then(normalizeErrorPromise.reject)
        .catch(rejection => {
          expect(rejection.err instanceof Error).toBe(true)
          expect(Array.isArray(rejection.run)).toBe(true)
          normalizeErrorPromise.resolve()
        })

      snapAction(action, mocks, ['Definitely not there'], options)
        .then(timetableErrorPromise.reject)
        .catch(rejection => {
          expect(rejection.err instanceof Error).toBe(true)
          expect(Array.isArray(rejection.run)).toBe(true)
          timetableErrorPromise.resolve()
        })

      Promise.all([
        normalizeErrorPromise,
        timetableErrorPromise,
      ])
        .then(() => {
          done()
        })
        .catch(done)
    })
  })
})