import { faker } from '@faker-js/faker'
import httpStatus from 'http-status'
import { TableReference } from 'kysely/dist/cjs/parser/table-parser'
import { authProviders } from '../../../src/config/authProviders'
import { getConfig } from '../../../src/config/config'
import { Database, getDBClient } from '../../../src/config/database'
import { GithubUser } from '../../../src/models/authProvider.model'
import { githubAuthorisation, insertAuthorisations } from '../../fixtures/authorisations.fixture'
import { TokenResponse } from '../../fixtures/token.fixture'
import { userOne, insertUsers, UserResponse } from '../../fixtures/user.fixture'
import { clearDBTables } from '../../utils/clearDBTables'
import { request } from '../../utils/testRequest'

const env = getMiniflareBindings()
const config = getConfig(env)
const client = getDBClient(config.database)

clearDBTables(['user' as TableReference<Database>], config.database)

describe('Oauth routes', () => {
  describe('GET /v1/auth/github/redirect', () => {
    test('should return 302 and successfully redirect to github', async () => {
      const res = await request('/v1/auth/github/redirect', {
        method: 'GET',
      })
      expect(res.status).toBe(httpStatus.FOUND)
      expect(res.headers.get('location')).toBe(
        'https://github.com/login/oauth/authorize?allow_signup=true&' +
        `client_id=${config.oauth.github.clientId}&scope=read%3Auser%20user%3Aemail`
      )
    })
  })

  describe('GET /v1/auth/google/redirect', () => {
    test('should return 302 and successfully redirect to google', async () => {
      const urlEncodedRedirectUrl = encodeURIComponent(config.oauth.google.redirectUrl)
      const res = await request('/v1/auth/google/redirect', {
        method: 'GET',
      })
      expect(res.status).toBe(httpStatus.FOUND)
      expect(res.headers.get('location')).toBe(
        `https://accounts.google.com/o/oauth2/v2/auth?client_id=${config.oauth.google.clientId}&` +
        `include_granted_scopes=true&redirect_uri=${urlEncodedRedirectUrl}&` +
        'response_type=code&scope=openid%20email%20profile&state=pass-through%20value'
      )
    })
  })

  describe('GET /v1/auth/spotify/redirect', () => {
    test('should return 302 and successfully redirect to spotify', async () => {
      const urlEncodedRedirectUrl = encodeURIComponent(config.oauth.spotify.redirectUrl)
      const res = await request('/v1/auth/spotify/redirect', {
        method: 'GET',
      })
      expect(res.status).toBe(httpStatus.FOUND)
      expect(res.headers.get('location')).toBe(
        `https://accounts.spotify.com/authorize?client_id=${config.oauth.spotify.clientId}&` +
        `redirect_uri=${urlEncodedRedirectUrl}&response_type=code&` +
        'scope=user-library-read%20playlist-modify-private&show_dialog=false'
      )
    })
  })

  describe('GET /v1/auth/discord/redirect', () => {
    test('should return 302 and successfully redirect to discord', async () => {
      const urlEncodedRedirectUrl = encodeURIComponent(config.oauth.discord.redirectUrl)
      const res = await request('/v1/auth/discord/redirect', {
        method: 'GET',
      })
      expect(res.status).toBe(httpStatus.FOUND)
      expect(res.headers.get('location')).toBe(
        `https://discord.com/api/oauth2/authorize?client_id=${config.oauth.discord.clientId}&` +
        `redirect_uri=${urlEncodedRedirectUrl}&response_type=code&scope=identify%20email`
      )
    })
  })

  describe('GET /v1/auth/github/callback', () => {
    let newUser: GithubUser
    beforeAll(async () => {
      newUser = {
        id: faker.datatype.number(),
        name: faker.name.fullName(),
        email: faker.internet.email()
      }
    })
    test('should return 200 and successfully register user if request data is ok', async () => {
      const fetchMock = getMiniflareFetchMock()
      const githubApiMock = fetchMock.get('https://api.github.com')
      githubApiMock
        .intercept({method: 'GET', path: '/user'})
        .reply(200, JSON.stringify(newUser))
      const githubMock = fetchMock.get('https://github.com')
      githubMock
        .intercept({method: 'POST', path: '/login/oauth/access_token'})
        .reply(200, JSON.stringify({access_token: '1234'}))

      const providerId = 123456
      const res = await request(`/v1/auth/github/callback?code=${providerId}`, {
        method: 'GET',
      })
      const body = await res.json<{ user: UserResponse; tokens: TokenResponse }>()
      expect(res.status).toBe(httpStatus.OK)
      expect(body.user).not.toHaveProperty('password')
      expect(body.user).toEqual({
        id: expect.anything(),
        name: newUser.name,
        email: newUser.email,
        role: 'user',
        is_email_verified: 1
      })

      const dbUser = await client
        .selectFrom('user')
        .selectAll()
        .where('user.id', '=', body.user.id)
        .executeTakeFirst()

      expect(dbUser).toBeDefined()
      if (!dbUser) return

      expect(dbUser.password).toBeNull()
      expect(dbUser).toMatchObject({
        name: newUser.name,
        password: null,
        email: newUser.email,
        role: 'user',
        is_email_verified: 1
      })

      const oauthUser = await client
        .selectFrom('authorisations')
        .selectAll()
        .where('authorisations.provider_type', '=', authProviders.GITHUB)
        .where('authorisations.user_id', '=', String(body.user.id))
        .where('authorisations.provider_user_id', '=', String(newUser.id))
        .executeTakeFirst()

      expect(oauthUser).toBeDefined()
      if (!oauthUser) return

      expect(body.tokens).toEqual({
        access: { token: expect.anything(), expires: expect.anything() },
        refresh: { token: expect.anything(), expires: expect.anything() }
      })
    })

    test('should return 200 and successfully login user if already created', async () => {
      const ids = await insertUsers([userOne], config.database)
      const userId = ids[0].toString()
      const githubUser = githubAuthorisation(userId)
      await insertAuthorisations([githubUser], config.database)
      newUser.id = parseInt(githubUser.provider_user_id)

      const fetchMock = getMiniflareFetchMock()
      const githubApiMock = fetchMock.get('https://api.github.com')
      githubApiMock
        .intercept({method: 'GET', path: '/user'})
        .reply(200, JSON.stringify(newUser))
      const githubMock = fetchMock.get('https://github.com')
      githubMock
        .intercept({method: 'POST', path: '/login/oauth/access_token'})
        .reply(200, JSON.stringify({access_token: '1234'}))

      const providerId = 123456
      const res = await request(`/v1/auth/github/callback?code=${providerId}`, {
        method: 'GET',
      })
      const body = await res.json<{ user: UserResponse; tokens: TokenResponse }>()
      expect(res.status).toBe(httpStatus.OK)
      expect(body.user).not.toHaveProperty('password')
      expect(body.user).toEqual({
        id: parseInt(userId),
        name: userOne.name,
        email: userOne.email,
        role: userOne.role,
        is_email_verified: 0
      })

      expect(body.tokens).toEqual({
        access: { token: expect.anything(), expires: expect.anything() },
        refresh: { token: expect.anything(), expires: expect.anything() }
      })
    })

    test('should return 403 if user exists but has not linked their github', async () => {
      await insertUsers([userOne], config.database)
      newUser.email = userOne.email

      const fetchMock = getMiniflareFetchMock()
      const githubApiMock = fetchMock.get('https://api.github.com')
      githubApiMock
        .intercept({method: 'GET', path: '/user'})
        .reply(200, JSON.stringify(newUser))
      const githubMock = fetchMock.get('https://github.com')
      githubMock
        .intercept({method: 'POST', path: '/login/oauth/access_token'})
        .reply(200, JSON.stringify({access_token: '1234'}))

      const providerId = 123456
      const res = await request(`/v1/auth/github/callback?code=${providerId}`, {
        method: 'GET',
      })
      const body = await res.json<{ user: UserResponse; tokens: TokenResponse }>()
      expect(res.status).toBe(httpStatus.FORBIDDEN)
      expect(body).toEqual({
        code: httpStatus.FORBIDDEN,
        message: 'Cannot signup with github, user already exists with that email'
      })
    })


    test('should return 401 if code is invalid', async () => {
      const fetchMock = getMiniflareFetchMock()
      const githubMock = fetchMock.get('https://github.com')
      githubMock
        .intercept({method: 'POST', path: '/login/oauth/access_token'})
        .reply(httpStatus.UNAUTHORIZED, JSON.stringify({error: 'error'}))

      const providerId = 123456
      const res = await request(`/v1/auth/github/callback?code=${providerId}`, {
        method: 'GET',
      })
      expect(res.status).toBe(httpStatus.UNAUTHORIZED)
    })

    test('should return 400 if no code provided', async () => {
      const res = await request('/v1/auth/github/callback', {
        method: 'GET',
      })
      expect(res.status).toBe(httpStatus.BAD_REQUEST)
    })
  })
})
