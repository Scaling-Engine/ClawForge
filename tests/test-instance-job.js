import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildInstanceJobDescription } from '../lib/tools/instance-job.js';

const baseConfig = {
  name: 'testbot',
  purpose: 'Test dev agent for QA automation',
  allowed_repos: ['my-repo'],
  enabled_channels: ['slack'],
};

describe('buildInstanceJobDescription', () => {
  it('includes all 6 instance file paths', () => {
    const output = buildInstanceJobDescription(baseConfig);
    assert.ok(output.includes('instances/testbot/Dockerfile'), 'missing Dockerfile path');
    assert.ok(output.includes('instances/testbot/config/SOUL.md'), 'missing SOUL.md path');
    assert.ok(output.includes('instances/testbot/config/AGENT.md'), 'missing AGENT.md path');
    assert.ok(output.includes('instances/testbot/config/EVENT_HANDLER.md'), 'missing EVENT_HANDLER.md path');
    assert.ok(output.includes('instances/testbot/config/REPOS.json'), 'missing REPOS.json path');
    assert.ok(output.includes('instances/testbot/.env.example'), 'missing .env.example path');
  });

  it('includes REPOS.json with ScalingEngine owner and correct slug', () => {
    const output = buildInstanceJobDescription(baseConfig);
    assert.ok(output.includes('"owner": "ScalingEngine"'), 'missing ScalingEngine owner');
    assert.ok(output.includes('"slug": "my-repo"'), 'missing repo slug');
  });

  it('contains exact tool name casing in AGENT.md section', () => {
    const output = buildInstanceJobDescription(baseConfig);
    assert.ok(output.includes('**Read**, **Write**, **Edit**'), 'missing exact Read/Write/Edit casing');
    assert.ok(output.includes('**Bash**'), 'missing exact Bash casing');
    assert.ok(output.includes('**Glob**, **Grep**'), 'missing exact Glob/Grep casing');
    assert.ok(output.includes('**Task**'), 'missing exact Task casing');
    assert.ok(output.includes('**Skill**'), 'missing exact Skill casing');
  });

  it('SOUL.md reflects purpose, not generic boilerplate', () => {
    const config = {
      ...baseConfig,
      purpose: 'Marketing automation agent for Acme Corp',
    };
    const output = buildInstanceJobDescription(config);
    assert.ok(output.includes('Marketing automation'), 'purpose not reflected in output');
    assert.ok(output.includes('Acme Corp'), 'org name not reflected in output');
    assert.ok(!output.includes('Noah'), 'contains Noah reference (boilerplate leak)');
    assert.ok(!output.includes('Archie'), 'contains Archie reference (boilerplate leak)');
  });

  it('excludes telegram env vars when only slack enabled', () => {
    const output = buildInstanceJobDescription(baseConfig);
    assert.ok(!output.includes('TELEGRAM_BOT_TOKEN'), 'should not include TELEGRAM_BOT_TOKEN');
    assert.ok(!output.includes('TELEGRAM_WEBHOOK_SECRET'), 'should not include TELEGRAM_WEBHOOK_SECRET');
  });

  it('includes all channel env vars when all channels enabled', () => {
    const config = {
      ...baseConfig,
      enabled_channels: ['slack', 'telegram', 'web'],
    };
    const output = buildInstanceJobDescription(config);
    assert.ok(output.includes('SLACK_BOT_TOKEN'), 'missing SLACK_BOT_TOKEN');
    assert.ok(output.includes('TELEGRAM_BOT_TOKEN'), 'missing TELEGRAM_BOT_TOKEN');
    assert.ok(output.includes('AUTH_TRUST_HOST'), 'missing AUTH_TRUST_HOST');
  });

  it('docker-compose instructions reference Edit tool, not Write tool for modifications', () => {
    const output = buildInstanceJobDescription(baseConfig);
    assert.ok(output.includes('Use the Edit tool'), 'missing Edit tool instruction');
    assert.ok(output.includes('Do NOT rewrite the entire file with the Write tool'), 'missing Write tool prohibition');
  });

  it('docker-compose has correct env prefix derivation', () => {
    const output = buildInstanceJobDescription(baseConfig);
    assert.ok(output.includes('${TESTBOT_APP_URL}'), 'missing TESTBOT_ env prefix');
    assert.ok(output.includes('${TESTBOT_GH_TOKEN}'), 'missing TESTBOT_GH_TOKEN');
  });

  it('handles hyphenated names in env prefix', () => {
    const config = {
      ...baseConfig,
      name: 'acme-marketing',
    };
    const output = buildInstanceJobDescription(config);
    assert.ok(output.includes('${ACME_MARKETING_APP_URL}'), 'hyphen not converted to underscore in prefix');
  });

  it('EVENT_HANDLER.md only mentions enabled channels', () => {
    const config = {
      ...baseConfig,
      enabled_channels: ['web'],
    };
    const output = buildInstanceJobDescription(config);
    // The role section should mention Web Chat but not Slack or Telegram
    const eventHandlerSection = output.split('File 4:')[1]?.split('File 5:')[0] || '';
    // Check the role line specifically
    assert.ok(eventHandlerSection.includes('Web Chat'), 'missing Web Chat in EVENT_HANDLER');
    assert.ok(!eventHandlerSection.includes('**Slack**'), 'should not mention Slack as a bold channel');
    assert.ok(!eventHandlerSection.includes('**Telegram**'), 'should not mention Telegram as a bold channel');
  });

  it('includes validation checklist', () => {
    const output = buildInstanceJobDescription(baseConfig);
    assert.ok(output.includes('Validation Checklist'), 'missing validation checklist');
    assert.ok(output.includes('does NOT contain literal'), 'missing shell safety check');
  });

  it('includes scope restrictions for limited repos', () => {
    const output = buildInstanceJobDescription(baseConfig);
    assert.ok(output.includes('ONLY'), 'missing scope restriction language');
    assert.ok(output.includes('my-repo'), 'missing repo name in scope section');
  });

  it('captures slack_user_ids in env example when provided', () => {
    const config = {
      ...baseConfig,
      slack_user_ids: ['U0ABC123', 'U0DEF456'],
    };
    const output = buildInstanceJobDescription(config);
    assert.ok(output.includes('U0ABC123'), 'missing first slack user ID');
    assert.ok(output.includes('U0DEF456'), 'missing second slack user ID');
  });

  it('captures telegram_chat_id in env example when provided', () => {
    const config = {
      ...baseConfig,
      enabled_channels: ['telegram'],
      telegram_chat_id: '123456789',
    };
    const output = buildInstanceJobDescription(config);
    assert.ok(output.includes('123456789'), 'missing telegram chat ID');
  });
});
