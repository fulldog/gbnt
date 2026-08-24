package watermark

import "testing"

func TestFormatDMS(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name  string
		deg   float64
		isLat bool
		want  string
	}{
		{name: "liaocheng lat", deg: 36.4489, isLat: true, want: "36°26'56\"N"},
		{name: "liaocheng lng", deg: 115.982, isLat: false, want: "115°58'55\"E"},
		{name: "south", deg: -22.5456, isLat: true, want: "22°32'44\"S"},
		{name: "west", deg: -114.0528, isLat: false, want: "114°3'10\"W"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := FormatDMS(tc.deg, tc.isLat)
			if got != tc.want {
				t.Fatalf("got %q want %q", got, tc.want)
			}
		})
	}
}

func TestFormatCoordLine(t *testing.T) {
	t.Parallel()
	got := FormatCoordLine(36.4489, 115.982)
	want := "36°26'56\"N, 115°58'55\"E"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestFormatUserLine(t *testing.T) {
	t.Parallel()
	if got := formatUserLine("李强"); got != "李强" {
		t.Fatalf("got %q", got)
	}
	if got := formatUserLine("  "); got != "" {
		t.Fatalf("empty want blank, got %q", got)
	}
}
