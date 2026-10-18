import { createTheme } from '@grafana/data';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { getData, theme } from 'testData';
import ColorScale from './ColorScale';

test('Creating a scale', () => {
  let testProps = {
    thresholds: [
      {
        color: '#5794F2',
        percent: 0,
      },
      {
        color: '#73BF69',
        percent: 10,
      },
      {
        color: '#FADE2A',
        percent: 20,
      },
      {
        color: '#FF9830',
        percent: 30,
      },
      {
        color: '#FA6400',
        percent: 40,
      },
      {
        color: '#E02F44',
        percent: 50,
      },
      {
        color: '#C4162A',
        percent: 60,
      },
      {
        color: '#B877D9',
        percent: 70,
      },
      {
        color: '#8F3BB8',
        percent: 80,
      },
      {
        color: '#ff00ce',
        percent: 90,
      },
    ],
    settings: getData(theme).settings,
  };

  // Render the panel
  const { rerender } = render(<ColorScale {...testProps} />);

  // Check if scale items are all rendered
  expect(screen.getAllByTestId('scale-item')).toHaveLength(testProps.thresholds.length);
  testProps.thresholds.forEach((t, i) => {
    if (i < testProps.thresholds.length - 1) {
      expect(screen.getByText(`${t.percent}% - ${testProps.thresholds[i + 1].percent}%`)).not.toBeNull();
    } else {
      expect(screen.getByText(`${t.percent}% - 100%`)).not.toBeNull();
    }
  });

  // Check that scale doesn't render without settings
  let testProps2 = { ...testProps };
  delete (testProps2.settings as Partial<typeof testProps2.settings>).scale;
  rerender(<ColorScale {...testProps2} />);

  expect(screen.queryByTestId('scale-item')).toBeNull();
});

// #278: explicit scale font color and optional background box.
test('scale font color override is applied to the title and labels', () => {
  const settings = structuredClone(getData(theme).settings);
  settings.scale.fontColor = 'rgb(255, 0, 204)';
  render(<ColorScale thresholds={[{ color: '#73BF69', percent: 0 }]} settings={settings} />);

  const title = screen.getByText(settings.scale.title);
  expect(getComputedStyle(title).color).toBe('rgb(255, 0, 204)');
  const label = screen.getByText('0% - 100%');
  expect(getComputedStyle(label).color).toBe('rgb(255, 0, 204)');
});

test('scale background box renders only when configured', () => {
  const settings = structuredClone(getData(theme).settings);
  const { rerender } = render(
    <ColorScale thresholds={[{ color: '#73BF69', percent: 0 }]} settings={settings} />
  );
  // Default: transparent, no border — exactly the old behavior.
  const container = screen.getByTestId('color-scale');
  expect(getComputedStyle(container).background).toBe('');

  const boxed = structuredClone(settings);
  boxed.scale.backgroundColor = 'rgb(24, 27, 31)';
  rerender(<ColorScale thresholds={[{ color: '#73BF69', percent: 0 }]} settings={boxed} />);
  expect(getComputedStyle(screen.getByTestId('color-scale')).background).toContain('rgb(24, 27, 31)');
});

test('without an override the automatic contrast color is kept', () => {
  const settings = structuredClone(getData(theme).settings);
  render(<ColorScale thresholds={[{ color: '#73BF69', percent: 0 }]} settings={settings} />);
  // testData panel background is #FFFFFF -> auto contrast resolves dark.
  const title = screen.getByText(settings.scale.title);
  expect(getComputedStyle(title).color).not.toBe('');
});

// #327: Absolute Value legend labels can be formatted with a unit.
test('value mode without a scale unit renders raw numbers (pre-#327 behavior)', () => {
  const settings = structuredClone(getData(theme).settings);
  settings.colorScaleMode = 'value';
  delete settings.scale.scaleUnit;
  render(
    <ColorScale
      thresholds={[
        { color: '#73BF69', percent: 500000000 },
        { color: '#FF9830', percent: 750000000 },
      ]}
      settings={settings}
    />
  );
  expect(screen.getByText('500000000 – 750000000')).not.toBeNull();
  expect(screen.getByText('750000000+')).not.toBeNull();
});

test('value mode with a bps scale unit formats labels with automatic prefixes', () => {
  const settings = structuredClone(getData(theme).settings);
  settings.colorScaleMode = 'value';
  settings.scale.scaleUnit = 'bps';
  render(
    <ColorScale
      thresholds={[
        { color: '#73BF69', percent: 500000000 },
        { color: '#FF9830', percent: 750000000 },
      ]}
      settings={settings}
    />
  );
  // 500000000 bps -> "500 Mb/s", 750000000 bps -> "750 Mb/s".
  expect(screen.getByText('500 Mb/s – 750 Mb/s')).not.toBeNull();
  expect(screen.getByText('750 Mb/s+')).not.toBeNull();
});

// #44: the threshold labels had line-height 0px, so they collapsed onto the
// colour boxes and overlapped each other in a tall scale. nowrap keeps a
// "10% - 20%" range on one line next to its box.
test('threshold labels keep a readable line height on one line (#44)', () => {
  render(
    <ColorScale
      thresholds={[
        { color: '#73BF69', percent: 0 },
        { color: '#F2495C', percent: 50 },
      ]}
      settings={getData(theme).settings}
    />
  );
  const label = screen.getByText('0% - 50%');
  expect(getComputedStyle(label).lineHeight).toBe('normal');
  expect(getComputedStyle(label).whiteSpace).toBe('nowrap');
});

// #357: the scale's text colour and box border are theme tokens, so they
// follow light/dark switching. Hard-coded black text was unreadable on the
// dark theme.
test('the scale box uses theme tokens for text and border (#357)', () => {
  const gt = createTheme();
  const settings = structuredClone(getData(theme).settings);
  settings.scale.backgroundColor = 'rgb(24, 27, 31)';
  render(<ColorScale thresholds={[{ color: '#73BF69', percent: 0 }]} settings={settings} />);
  const box = getComputedStyle(screen.getByTestId('color-scale'));
  expect(box.color).toBe(gt.colors.text.primary);
  expect(box.border).toContain(gt.colors.border.weak);
});
