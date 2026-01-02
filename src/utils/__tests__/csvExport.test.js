const {
  escapeCSVValue,
  arrayToCSV,
  generateFilename
} = require('../csvExport');

describe('csvExport', () => {
  describe('escapeCSVValue', () => {
    describe('basic escaping', () => {
      it('returns simple string values unchanged', () => {
        expect(escapeCSVValue('John Doe')).toBe('John Doe');
        expect(escapeCSVValue('Simple')).toBe('Simple');
        expect(escapeCSVValue('123')).toBe('123');
      });

      it('converts numbers to strings', () => {
        expect(escapeCSVValue(42)).toBe('42');
        expect(escapeCSVValue(3.14)).toBe('3.14');
        expect(escapeCSVValue(0)).toBe('0');
      });

      it('converts booleans to strings', () => {
        expect(escapeCSVValue(true)).toBe('true');
        expect(escapeCSVValue(false)).toBe('false');
      });
    });

    describe('null and undefined handling', () => {
      it('converts null to empty string', () => {
        expect(escapeCSVValue(null)).toBe('');
      });

      it('converts undefined to empty string', () => {
        expect(escapeCSVValue(undefined)).toBe('');
      });
    });

    describe('comma escaping', () => {
      it('quotes values containing commas', () => {
        expect(escapeCSVValue('Doe, John')).toBe('"Doe, John"');
        expect(escapeCSVValue('City, State, Country')).toBe('"City, State, Country"');
      });

      it('quotes values with comma at the start', () => {
        expect(escapeCSVValue(',leading')).toBe('",leading"');
      });

      it('quotes values with comma at the end', () => {
        expect(escapeCSVValue('trailing,')).toBe('"trailing,"');
      });

      it('quotes values with multiple commas', () => {
        expect(escapeCSVValue('a,b,c,d')).toBe('"a,b,c,d"');
      });
    });

    describe('quote escaping', () => {
      it('escapes and quotes values containing quotes', () => {
        expect(escapeCSVValue('He said "Hi"')).toBe('"He said ""Hi"""');
      });

      it('escapes multiple quotes', () => {
        expect(escapeCSVValue('"Hello" and "Goodbye"')).toBe('"""Hello"" and ""Goodbye"""');
      });

      it('escapes single quote at start', () => {
        expect(escapeCSVValue('"Start')).toBe('"""Start"');
      });

      it('escapes single quote at end', () => {
        expect(escapeCSVValue('End"')).toBe('"End"""');
      });

      it('escapes only quotes in a string of quotes', () => {
        // Input: """ (3 quotes)
        // Each quote becomes "" (doubled), so """ becomes """"""
        // Then wrapped in quotes: "+" + """""" + """ = """"""""
        expect(escapeCSVValue('"""')).toBe('""""""""');
      });
    });

    describe('newline escaping', () => {
      it('quotes values containing newlines', () => {
        expect(escapeCSVValue('Line 1\nLine 2')).toBe('"Line 1\nLine 2"');
      });

      it('quotes values containing carriage returns', () => {
        expect(escapeCSVValue('Line 1\rLine 2')).toBe('"Line 1\rLine 2"');
      });

      it('quotes values containing CRLF', () => {
        expect(escapeCSVValue('Line 1\r\nLine 2')).toBe('"Line 1\r\nLine 2"');
      });

      it('quotes values with multiple newlines', () => {
        expect(escapeCSVValue('L1\nL2\nL3')).toBe('"L1\nL2\nL3"');
      });
    });

    describe('special character combinations', () => {
      it('handles values with commas and quotes', () => {
        expect(escapeCSVValue('Smith, said "yes"')).toBe('"Smith, said ""yes"""');
      });

      it('handles values with commas and newlines', () => {
        expect(escapeCSVValue('City, State\nZIP')).toBe('"City, State\nZIP"');
      });

      it('handles values with quotes and newlines', () => {
        expect(escapeCSVValue('"Line 1"\n"Line 2"')).toBe('"""Line 1""\n""Line 2"""');
      });

      it('handles values with all special characters', () => {
        expect(escapeCSVValue('He said, "Hi"\nNext line')).toBe('"He said, ""Hi""\nNext line"');
      });
    });

    describe('edge cases', () => {
      it('handles empty string', () => {
        expect(escapeCSVValue('')).toBe('');
      });

      it('handles whitespace-only strings', () => {
        expect(escapeCSVValue('   ')).toBe('   ');
        expect(escapeCSVValue('\t')).toBe('\t');
      });

      it('handles special characters', () => {
        expect(escapeCSVValue('Email@example.com')).toBe('Email@example.com');
        expect(escapeCSVValue('Price: $99.99')).toBe('Price: $99.99');
        expect(escapeCSVValue('Test & Demo')).toBe('Test & Demo');
      });

      it('handles unicode characters', () => {
        expect(escapeCSVValue('Café')).toBe('Café');
        expect(escapeCSVValue('日本語')).toBe('日本語');
        expect(escapeCSVValue('Emoji 🎉')).toBe('Emoji 🎉');
      });

      it('handles very long strings', () => {
        const longString = 'a'.repeat(10000);
        expect(escapeCSVValue(longString)).toBe(longString);
      });

      it('handles very long strings with special characters', () => {
        const longString = 'a'.repeat(5000) + ',' + 'b'.repeat(5000);
        expect(escapeCSVValue(longString)).toBe('"' + longString + '"');
      });
    });
  });

  describe('arrayToCSV', () => {
    describe('basic conversion', () => {
      it('converts array of objects to CSV with headers', () => {
        const data = [
          { firstName: 'John', lastName: 'Doe', age: 25 },
          { firstName: 'Jane', lastName: 'Smith', age: 30 }
        ];

        const columns = [
          { label: 'First Name', key: 'firstName' },
          { label: 'Last Name', key: 'lastName' },
          { label: 'Age', key: 'age' }
        ];

        const expected = 'First Name,Last Name,Age\nJohn,Doe,25\nJane,Smith,30';
        expect(arrayToCSV(data, columns)).toBe(expected);
      });

      it('handles single row of data', () => {
        const data = [{ name: 'John', age: 25 }];
        const columns = [
          { label: 'Name', key: 'name' },
          { label: 'Age', key: 'age' }
        ];

        const expected = 'Name,Age\nJohn,25';
        expect(arrayToCSV(data, columns)).toBe(expected);
      });

      it('handles empty data array', () => {
        const data = [];
        const columns = [
          { label: 'Name', key: 'name' },
          { label: 'Age', key: 'age' }
        ];

        const expected = 'Name,Age';
        expect(arrayToCSV(data, columns)).toBe(expected);
      });
    });

    describe('column configuration', () => {
      it('uses custom column labels', () => {
        const data = [{ fn: 'John', ln: 'Doe' }];
        const columns = [
          { label: 'First Name', key: 'fn' },
          { label: 'Last Name', key: 'ln' }
        ];

        const csv = arrayToCSV(data, columns);
        expect(csv).toContain('First Name,Last Name');
      });

      it('handles column order from configuration', () => {
        const data = [{ a: '1', b: '2', c: '3' }];
        const columns = [
          { label: 'C', key: 'c' },
          { label: 'A', key: 'a' },
          { label: 'B', key: 'b' }
        ];

        const expected = 'C,A,B\n3,1,2';
        expect(arrayToCSV(data, columns)).toBe(expected);
      });

      it('handles subset of object properties', () => {
        const data = [{ a: '1', b: '2', c: '3', d: '4' }];
        const columns = [
          { label: 'A', key: 'a' },
          { label: 'C', key: 'c' }
        ];

        const expected = 'A,C\n1,3';
        expect(arrayToCSV(data, columns)).toBe(expected);
      });

      it('escapes special characters in column labels', () => {
        const data = [{ name: 'John' }];
        const columns = [{ label: 'Name, Full', key: 'name' }];

        const csv = arrayToCSV(data, columns);
        expect(csv).toContain('"Name, Full"');
      });
    });

    describe('nested property access', () => {
      it('supports nested properties with dot notation', () => {
        const data = [
          { user: { name: 'John', contact: { email: 'john@example.com' } } }
        ];
        const columns = [
          { label: 'Name', key: 'user.name' },
          { label: 'Email', key: 'user.contact.email' }
        ];

        const expected = 'Name,Email\nJohn,john@example.com';
        expect(arrayToCSV(data, columns)).toBe(expected);
      });

      it('handles missing nested properties', () => {
        const data = [
          { user: { name: 'John' } }
        ];
        const columns = [
          { label: 'Name', key: 'user.name' },
          { label: 'Email', key: 'user.contact.email' }
        ];

        const expected = 'Name,Email\nJohn,';
        expect(arrayToCSV(data, columns)).toBe(expected);
      });

      it('handles null intermediate objects', () => {
        const data = [
          { user: null }
        ];
        const columns = [
          { label: 'Name', key: 'user.name' }
        ];

        const expected = 'Name\n';
        expect(arrayToCSV(data, columns)).toBe(expected);
      });
    });

    describe('empty and null value handling', () => {
      it('handles null values in data', () => {
        const data = [
          { name: 'John', age: null },
          { name: null, age: 25 }
        ];
        const columns = [
          { label: 'Name', key: 'name' },
          { label: 'Age', key: 'age' }
        ];

        const expected = 'Name,Age\nJohn,\n,25';
        expect(arrayToCSV(data, columns)).toBe(expected);
      });

      it('handles undefined values in data', () => {
        const data = [
          { name: 'John' },
          { name: 'Jane', age: 30 }
        ];
        const columns = [
          { label: 'Name', key: 'name' },
          { label: 'Age', key: 'age' }
        ];

        const expected = 'Name,Age\nJohn,\nJane,30';
        expect(arrayToCSV(data, columns)).toBe(expected);
      });

      it('handles empty string values', () => {
        const data = [{ name: '', age: '' }];
        const columns = [
          { label: 'Name', key: 'name' },
          { label: 'Age', key: 'age' }
        ];

        const expected = 'Name,Age\n,';
        expect(arrayToCSV(data, columns)).toBe(expected);
      });

      it('handles missing properties', () => {
        const data = [
          { name: 'John' },
          { age: 25 }
        ];
        const columns = [
          { label: 'Name', key: 'name' },
          { label: 'Age', key: 'age' }
        ];

        const expected = 'Name,Age\nJohn,\n,25';
        expect(arrayToCSV(data, columns)).toBe(expected);
      });
    });

    describe('special characters in data', () => {
      it('escapes commas in data values', () => {
        const data = [{ name: 'Doe, John', city: 'New York, NY' }];
        const columns = [
          { label: 'Name', key: 'name' },
          { label: 'City', key: 'city' }
        ];

        const expected = 'Name,City\n"Doe, John","New York, NY"';
        expect(arrayToCSV(data, columns)).toBe(expected);
      });

      it('escapes quotes in data values', () => {
        const data = [{ quote: 'He said "Hello"' }];
        const columns = [{ label: 'Quote', key: 'quote' }];

        const expected = 'Quote\n"He said ""Hello"""';
        expect(arrayToCSV(data, columns)).toBe(expected);
      });

      it('escapes newlines in data values', () => {
        const data = [{ address: '123 Main St\nApt 4B' }];
        const columns = [{ label: 'Address', key: 'address' }];

        const expected = 'Address\n"123 Main St\nApt 4B"';
        expect(arrayToCSV(data, columns)).toBe(expected);
      });

      it('handles mixed special characters in same row', () => {
        const data = [{
          name: 'Smith, Jane',
          quote: 'She said "Hi"',
          address: '456 Oak Ave\nUnit 2'
        }];
        const columns = [
          { label: 'Name', key: 'name' },
          { label: 'Quote', key: 'quote' },
          { label: 'Address', key: 'address' }
        ];

        const csv = arrayToCSV(data, columns);
        expect(csv).toContain('"Smith, Jane"');
        expect(csv).toContain('"She said ""Hi"""');
        expect(csv).toContain('"456 Oak Ave\nUnit 2"');
      });
    });

    describe('large dataset handling', () => {
      it('handles large number of rows', () => {
        const data = Array.from({ length: 10000 }, (_, i) => ({
          id: i,
          name: `User ${i}`,
          email: `user${i}@example.com`
        }));

        const columns = [
          { label: 'ID', key: 'id' },
          { label: 'Name', key: 'name' },
          { label: 'Email', key: 'email' }
        ];

        const csv = arrayToCSV(data, columns);
        const lines = csv.split('\n');
        expect(lines.length).toBe(10001); // header + 10000 rows
        expect(lines[0]).toBe('ID,Name,Email');
        expect(lines[1]).toBe('0,User 0,user0@example.com');
        expect(lines[10000]).toBe('9999,User 9999,user9999@example.com');
      });

      it('handles large number of columns', () => {
        const columnCount = 100;
        const data = [{}];
        const columns = [];

        for (let i = 0; i < columnCount; i++) {
          data[0][`col${i}`] = `value${i}`;
          columns.push({ label: `Column ${i}`, key: `col${i}` });
        }

        const csv = arrayToCSV(data, columns);
        const lines = csv.split('\n');
        expect(lines[0].split(',').length).toBe(columnCount);
        expect(lines[1].split(',').length).toBe(columnCount);
      });

      it('handles large dataset with special characters', () => {
        const data = Array.from({ length: 1000 }, (_, i) => ({
          name: `User ${i}, Test`,
          description: `Description with "quotes" and\nnewlines`,
          value: i
        }));

        const columns = [
          { label: 'Name', key: 'name' },
          { label: 'Description', key: 'description' },
          { label: 'Value', key: 'value' }
        ];

        const csv = arrayToCSV(data, columns);
        const lines = csv.split('\n');
        // Account for newlines within quoted fields
        expect(csv).toContain('"User 0, Test"');
        expect(csv).toContain('"Description with ""quotes"" and\nnewlines"');
      });
    });

    describe('validation', () => {
      it('throws error if data is not an array', () => {
        const columns = [{ label: 'Name', key: 'name' }];
        expect(() => arrayToCSV('not an array', columns)).toThrow('Data must be an array');
        expect(() => arrayToCSV(null, columns)).toThrow('Data must be an array');
        expect(() => arrayToCSV(undefined, columns)).toThrow('Data must be an array');
        expect(() => arrayToCSV({}, columns)).toThrow('Data must be an array');
      });

      it('throws error if columns is not an array', () => {
        const data = [{ name: 'John' }];
        expect(() => arrayToCSV(data, 'not an array')).toThrow('Columns must be a non-empty array');
        expect(() => arrayToCSV(data, null)).toThrow('Columns must be a non-empty array');
        expect(() => arrayToCSV(data, undefined)).toThrow('Columns must be a non-empty array');
        expect(() => arrayToCSV(data, {})).toThrow('Columns must be a non-empty array');
      });

      it('throws error if columns array is empty', () => {
        const data = [{ name: 'John' }];
        expect(() => arrayToCSV(data, [])).toThrow('Columns must be a non-empty array');
      });
    });

    describe('edge cases', () => {
      it('handles objects with extra properties not in columns', () => {
        const data = [{ a: '1', b: '2', c: '3', d: '4', e: '5' }];
        const columns = [
          { label: 'A', key: 'a' },
          { label: 'B', key: 'b' }
        ];

        const expected = 'A,B\n1,2';
        expect(arrayToCSV(data, columns)).toBe(expected);
      });

      it('handles heterogeneous data rows', () => {
        const data = [
          { name: 'John', age: 25, city: 'NYC' },
          { name: 'Jane' },
          { age: 30, city: 'LA' }
        ];
        const columns = [
          { label: 'Name', key: 'name' },
          { label: 'Age', key: 'age' },
          { label: 'City', key: 'city' }
        ];

        const expected = 'Name,Age,City\nJohn,25,NYC\nJane,,\n,30,LA';
        expect(arrayToCSV(data, columns)).toBe(expected);
      });

      it('handles boolean values', () => {
        const data = [
          { active: true, verified: false }
        ];
        const columns = [
          { label: 'Active', key: 'active' },
          { label: 'Verified', key: 'verified' }
        ];

        const expected = 'Active,Verified\ntrue,false';
        expect(arrayToCSV(data, columns)).toBe(expected);
      });

      it('handles numeric zero values', () => {
        const data = [{ count: 0, price: 0.0 }];
        const columns = [
          { label: 'Count', key: 'count' },
          { label: 'Price', key: 'price' }
        ];

        const expected = 'Count,Price\n0,0';
        expect(arrayToCSV(data, columns)).toBe(expected);
      });
    });
  });

  describe('generateFilename', () => {
    describe('basic filename generation', () => {
      it('generates filename with prefix and date', () => {
        const date = new Date(2026, 0, 2); // Month is 0-indexed
        const filename = generateFilename('players', date);
        expect(filename).toBe('players_2026-01-02.csv');
      });

      it('generates filename with different prefixes', () => {
        const date = new Date(2026, 0, 2);
        expect(generateFilename('coaches', date)).toBe('coaches_2026-01-02.csv');
        expect(generateFilename('high-school-coaches', date)).toBe('high-school-coaches_2026-01-02.csv');
        expect(generateFilename('reports', date)).toBe('reports_2026-01-02.csv');
      });

      it('uses current date when no date provided', () => {
        const now = new Date();
        const filename = generateFilename('test');

        // Extract date from filename
        const match = filename.match(/test_(\d{4}-\d{2}-\d{2})\.csv/);
        expect(match).not.toBeNull();

        const filenameDate = match[1];
        const expectedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        expect(filenameDate).toBe(expectedDate);
      });
    });

    describe('date formatting', () => {
      it('pads single digit months with zero', () => {
        const date = new Date(2026, 2, 15); // March 15, 2026
        const filename = generateFilename('test', date);
        expect(filename).toBe('test_2026-03-15.csv');
      });

      it('pads single digit days with zero', () => {
        const date = new Date(2026, 11, 5); // December 5, 2026
        const filename = generateFilename('test', date);
        expect(filename).toBe('test_2026-12-05.csv');
      });

      it('handles first day of year', () => {
        const date = new Date(2026, 0, 1); // January 1, 2026
        const filename = generateFilename('test', date);
        expect(filename).toBe('test_2026-01-01.csv');
      });

      it('handles last day of year', () => {
        const date = new Date(2026, 11, 31); // December 31, 2026
        const filename = generateFilename('test', date);
        expect(filename).toBe('test_2026-12-31.csv');
      });

      it('handles leap year date', () => {
        const date = new Date(2024, 1, 29); // February 29, 2024
        const filename = generateFilename('test', date);
        expect(filename).toBe('test_2024-02-29.csv');
      });
    });

    describe('validation', () => {
      it('throws error if prefix is empty string', () => {
        expect(() => generateFilename('')).toThrow('Prefix must be a non-empty string');
      });

      it('throws error if prefix is null', () => {
        expect(() => generateFilename(null)).toThrow('Prefix must be a non-empty string');
      });

      it('throws error if prefix is undefined', () => {
        expect(() => generateFilename(undefined)).toThrow('Prefix must be a non-empty string');
      });

      it('throws error if prefix is not a string', () => {
        expect(() => generateFilename(123)).toThrow('Prefix must be a non-empty string');
        expect(() => generateFilename({})).toThrow('Prefix must be a non-empty string');
        expect(() => generateFilename([])).toThrow('Prefix must be a non-empty string');
      });
    });

    describe('edge cases', () => {
      it('handles prefix with hyphens', () => {
        const date = new Date(2026, 0, 2);
        const filename = generateFilename('high-school-coaches', date);
        expect(filename).toBe('high-school-coaches_2026-01-02.csv');
      });

      it('handles prefix with underscores', () => {
        const date = new Date(2026, 0, 2);
        const filename = generateFilename('my_export_file', date);
        expect(filename).toBe('my_export_file_2026-01-02.csv');
      });

      it('handles long prefix', () => {
        const date = new Date(2026, 0, 2);
        const longPrefix = 'a'.repeat(100);
        const filename = generateFilename(longPrefix, date);
        expect(filename).toBe(`${longPrefix}_2026-01-02.csv`);
      });

      it('handles different years', () => {
        expect(generateFilename('test', new Date(2020, 5, 15))).toBe('test_2020-06-15.csv');
        expect(generateFilename('test', new Date(2030, 5, 15))).toBe('test_2030-06-15.csv');
        expect(generateFilename('test', new Date(1999, 5, 15))).toBe('test_1999-06-15.csv');
      });

      it('ignores time component of date', () => {
        const date1 = new Date(2026, 0, 2, 0, 0, 0);
        const date2 = new Date(2026, 0, 2, 23, 59, 59);
        expect(generateFilename('test', date1)).toBe('test_2026-01-02.csv');
        expect(generateFilename('test', date2)).toBe('test_2026-01-02.csv');
      });
    });
  });
});
