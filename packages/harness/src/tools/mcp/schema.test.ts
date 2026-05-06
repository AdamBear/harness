import { describe, expect, it, vi } from 'vitest'
import { ValidationError } from '../../errors/index.js'
import { validateMcpJsonSchema } from './schema.js'

describe('validateMcpJsonSchema', () => {
  it('accepts supported draft 2020-12 keywords and nullable type arrays', () => {
    const value = validateMcpJsonSchema({
      toolId: 'draw',
      where: 'mcp_input',
      schema: {
        type: 'object',
        required: ['title', 'tags'],
        additionalProperties: false,
        properties: {
          title: { type: 'string', minLength: 2, maxLength: 20 },
          count: { type: ['number', 'null'], minimum: 0, maximum: 5 },
          tags: { type: 'array', minItems: 1, maxItems: 2, items: { enum: ['a', 'b'] } },
          id: { type: 'string', format: 'uuid' }
        }
      },
      value: { title: 'Wiki', count: null, tags: ['a'], id: '123e4567-e89b-12d3-a456-426614174000' }
    })

    expect(value).toEqual({ title: 'Wiki', count: null, tags: ['a'], id: '123e4567-e89b-12d3-a456-426614174000' })
  })

  it('rejects unknown object keys only when additionalProperties is false', () => {
    expect(() => validateMcpJsonSchema({
      toolId: 'strict',
      where: 'mcp_input',
      schema: { type: 'object', additionalProperties: false, properties: { known: { type: 'string' } } },
      value: { known: 'ok', extra: true }
    })).toThrowError(ValidationError)

    expect(validateMcpJsonSchema({
      toolId: 'loose',
      where: 'mcp_input',
      schema: { type: 'object', properties: { known: { type: 'string' } } },
      value: { known: 'ok', extra: true }
    })).toEqual({ known: 'ok', extra: true })
  })

  it('reports validation issues with path, message, and keyword', () => {
    try {
      validateMcpJsonSchema({
        toolId: 'bad',
        where: 'mcp_output',
        schema: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email' },
            score: { type: 'number', minimum: 10 }
          }
        },
        value: { email: 'not-email', score: 3 }
      })
      throw new Error('expected validation failure')
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError)
      expect((error as ValidationError).meta).toEqual({
        where: 'mcp_output',
        issues: [
          { path: '/email', message: expect.stringContaining('email'), keyword: 'format' },
          { path: '/score', message: expect.stringContaining('minimum'), keyword: 'minimum' }
        ]
      })
    }
  })

  it('warns once per tool and keyword path for unsupported keywords and unknown formats', () => {
    const warn = vi.fn()
    const schema = {
      type: 'object',
      properties: {
        nested: {
          type: 'string',
          contentEncoding: 'base64',
          format: 'slug'
        }
      }
    }

    validateMcpJsonSchema({ toolId: 'warn-tool', where: 'mcp_input', schema, value: { nested: 'abc' }, warn })
    validateMcpJsonSchema({ toolId: 'warn-tool', where: 'mcp_input', schema, value: { nested: 'abc' }, warn })
    validateMcpJsonSchema({ toolId: 'other-tool', where: 'mcp_input', schema, value: { nested: 'abc' }, warn })

    expect(warn).toHaveBeenCalledTimes(4)
    expect(warn).toHaveBeenNthCalledWith(1, expect.objectContaining({ toolId: 'warn-tool', keyword: 'contentEncoding', path: '/properties/nested/contentEncoding' }))
    expect(warn).toHaveBeenNthCalledWith(2, expect.objectContaining({ toolId: 'warn-tool', keyword: 'format:slug', path: '/properties/nested/format' }))
  })

  it('throws a validation error for malformed schemas', () => {
    expect(() => validateMcpJsonSchema({
      toolId: 'malformed',
      where: 'mcp_input',
      schema: { type: 12 },
      value: 'x'
    })).toThrowError(ValidationError)
  })
})
